#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — provision-site.sh
#
# Panel süreci (unprivileged `panel` sistem kullanıcısı) tarafından
# `sudo` ile çağrılan TEK ayrıcalıklı betik. nginx/systemd/certbot/mysql
# gibi kök yetkisi gerektiren TÜM site provisioning işlemleri buradan
# geçer — panel süreci başka hiçbir komuta sudo erişimine sahip değil
# (bkz. /etc/sudoers.d/panel-provisioning).
#
# Doğrudan interaktif kullanım için değildir: her girdi argüman olarak
# gelir, hiçbir `read` yoktur, tüm girdiler burada BAĞIMSIZ OLARAK tekrar
# doğrulanır (çağıranın — Next.js API katmanının — zaten doğrulamış
# olması varsayılmaz; savunma derinliği).
#
# Kullanım: provision-site.sh <alt-komut> [argümanlar...]
# ============================================================

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'

msg()  { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}" >&2; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }

[[ ${EUID} -eq 0 ]] || die "Bu betik root olarak çalıştırılmalı (sudo ile çağrılmalı)."

# ------------------------------------------------------------
# Doğrulama yardımcıları — her biri hatalıysa net bir Türkçe mesajla die eder
# ------------------------------------------------------------
DOMAIN_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
SLUG_RE='^[a-z0-9-]+$'
USERNAME_RE='^[a-z][a-z0-9_-]{0,31}$'
DB_IDENT_RE='^[A-Za-z0-9_]{1,64}$'
DB_PASSWORD_RE='^[A-Za-z0-9!@#%^*_+=.-]{8,64}$'
START_CMD_RE='^[A-Za-z0-9_./:@%=, $-]{1,200}$'
ABS_PATH_RE='^/[A-Za-z0-9_./-]+$'
PHP_VERSION_RE='^[0-9]{1,2}\.[0-9]{1,2}$'
EMAIL_RE='^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
PORT_MIN=1
PORT_MAX=65535

validate_domain() {
  local d="$1"
  [[ -n "$d" ]] || die "Alan adı boş olamaz."
  [[ ${#d} -le 253 ]] || die "Alan adı çok uzun: $d"
  [[ "$d" =~ $DOMAIN_RE ]] || die "Geçersiz alan adı: $d"
}

validate_email() {
  local e="$1"
  [[ "$e" =~ $EMAIL_RE ]] || die "Geçersiz e-posta adresi: $e"
}

validate_port() {
  local p="$1"
  [[ "$p" =~ ^[0-9]+$ ]] || die "Geçersiz port (sayı olmalı): $p"
  (( p >= PORT_MIN && p <= PORT_MAX )) || die "Port aralık dışında (1-65535): $p"
}

validate_php_version() {
  local v="$1"
  [[ "$v" =~ $PHP_VERSION_RE ]] || die "Geçersiz PHP sürümü: $v"
}

validate_site_type() {
  case "$1" in
    WORDPRESS|PHP|NODEJS|STATIC|PYTHON|REVERSE_PROXY) ;;
    *) die "Geçersiz site türü: $1" ;;
  esac
}

validate_www_flag() {
  case "$1" in
    true|false) ;;
    *) die "www bayrağı 'true' ya da 'false' olmalı: $1" ;;
  esac
}

validate_abs_path() {
  local p="$1" label="${2:-yol}"
  [[ "$p" =~ $ABS_PATH_RE ]] || die "Geçersiz ${label}: $p"
  [[ "$p" != *".."* ]] || die "Geçersiz ${label} (üst dizin referansı içeremez): $p"
}

validate_site_root() {
  local p="$1"
  validate_abs_path "$p" "site kök dizini"
  [[ "$p" == /var/www/* ]] || die "Site kök dizini /var/www/ altında olmalı: $p"
}

validate_username_optional() {
  local u="$1"
  [[ -z "$u" ]] && return 0
  [[ "$u" =~ $USERNAME_RE ]] || die "Geçersiz linux kullanıcı adı: $u"
}

validate_db_ident() {
  local v="$1" label="${2:-veritabanı tanımlayıcısı}"
  [[ "$v" =~ $DB_IDENT_RE ]] || die "Geçersiz ${label}: $v"
}

validate_db_password() {
  local v="$1"
  [[ "$v" =~ $DB_PASSWORD_RE ]] || die "Geçersiz veritabanı şifresi (8-64 karakter, izinli semboller: !@#%^*_+=.-)."
}

validate_start_command() {
  local c="$1"
  [[ -n "$c" ]] || die "Başlatma komutu boş olamaz."
  [[ "$c" =~ $START_CMD_RE ]] || die "Geçersiz başlatma komutu (izin verilmeyen karakter): $c"
}

validate_lines() {
  local n="$1"
  [[ "$n" =~ ^[0-9]+$ ]] || die "Geçersiz satır sayısı: $n"
  (( n >= 1 && n <= 2000 )) || die "Satır sayısı 1-2000 aralığında olmalı: $n"
}

domain_slug() {
  local d="$1"
  echo "${d//./-}"
}

require_args() {
  local need="$1" got="$2" usage="$3"
  (( got >= need )) || die "Eksik argüman. Kullanım: ${usage}"
}

# ------------------------------------------------------------
# Nginx yardımcıları
# ------------------------------------------------------------
nginx_test_and_reload() {
  local nginx_test_log
  nginx_test_log="$(mktemp)"
  if ! nginx -t 2>"$nginx_test_log"; then
    warn "nginx -t başarısız:"
    cat "$nginx_test_log" >&2
    rm -f "$nginx_test_log"
    die "Nginx yapılandırması geçersiz, değişiklik geri alınmadı ama etkinleştirilmedi."
  fi
  rm -f "$nginx_test_log"
  systemctl reload nginx
}

ensure_linux_user() {
  local user="$1" home_dir="$2"
  [[ -z "$user" ]] && return 0
  if id "$user" >/dev/null 2>&1; then
    msg "Linux kullanıcısı zaten var: ${user}"
  else
    adduser --disabled-password --gecos "" --home "$home_dir" "$user" >/dev/null
    msg "Linux kullanıcısı oluşturuldu: ${user}"
  fi
}

# ------------------------------------------------------------
# create-vhost
# ------------------------------------------------------------
cmd_create_vhost() {
  require_args 3 "$#" "create-vhost <domain> <type> <www> ...type-specific args..."
  local domain="$1" type="$2" www="$3"
  validate_domain "$domain"
  validate_site_type "$type"
  validate_www_flag "$www"

  local server_names="$domain"
  [[ "$www" == "true" ]] && server_names="$domain www.$domain"

  local conf="/etc/nginx/sites-available/${domain}.conf"

  case "$type" in
    STATIC)
      require_args 4 "$#" "create-vhost <domain> STATIC <www> <site_root> [linux_user]"
      local site_root="$4" linux_user="${5:-}"
      validate_site_root "$site_root"
      validate_username_optional "$linux_user"

      mkdir -p "${site_root}/public"
      if [[ ! -f "${site_root}/public/index.html" ]]; then
        cat > "${site_root}/public/index.html" <<HTML
<!doctype html>
<html><head><meta charset="utf-8"><title>${domain}</title></head>
<body><h1>OK - ${domain}</h1></body></html>
HTML
      fi
      ensure_linux_user "$linux_user" "$site_root"
      [[ -n "$linux_user" ]] && chown -R "${linux_user}:${linux_user}" "$site_root"

      cat > "$conf" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${server_names};

  root ${site_root}/public;
  index index.html;

  access_log /var/log/nginx/${domain}.access.log;
  error_log  /var/log/nginx/${domain}.error.log;
  client_max_body_size 50m;

  location / { try_files \$uri \$uri/ =404; }
}
NGINX
      ;;

    PHP|WORDPRESS)
      if [[ "$type" == "PHP" ]]; then
        require_args 5 "$#" "create-vhost <domain> PHP <www> <php_version> <site_root> [linux_user]"
      else
        require_args 8 "$#" "create-vhost <domain> WORDPRESS <www> <php_version> <site_root> <db_name> <db_user> <db_password> [linux_user]"
      fi
      local php_ver="$4" site_root="$5"
      validate_php_version "$php_ver"
      validate_site_root "$site_root"

      local php_sock="/run/php/php${php_ver}-fpm.sock"
      [[ -S "$php_sock" ]] || die "PHP-FPM soket dosyası bulunamadı: ${php_sock} (php${php_ver}-fpm kurulu ve çalışıyor mu?)"

      mkdir -p "${site_root}/public"

      local linux_user=""
      if [[ "$type" == "WORDPRESS" ]]; then
        local db_name="$6" db_user="$7" db_password="$8"
        linux_user="${9:-}"
        validate_db_ident "$db_name" "veritabanı adı"
        validate_db_ident "$db_user" "veritabanı kullanıcısı"
        validate_db_password "$db_password"

        if [[ ! -f "${site_root}/public/wp-settings.php" ]]; then
          command -v curl >/dev/null 2>&1 || die "curl bulunamadı (WordPress indirilemiyor)."
          command -v tar >/dev/null 2>&1 || die "tar bulunamadı (WordPress açılamıyor)."
          info "WordPress indiriliyor..."
          local tmp_tgz tmp_dir
          tmp_tgz="$(mktemp /tmp/wp-XXXXXX.tgz)"
          tmp_dir="$(mktemp -d /tmp/wp-extract-XXXXXX)"
          curl -fsSL https://wordpress.org/latest.tar.gz -o "$tmp_tgz" || die "WordPress indirilemedi."
          tar -xzf "$tmp_tgz" -C "$tmp_dir"
          rsync -a "${tmp_dir}/wordpress/" "${site_root}/public/"
          rm -rf "$tmp_dir" "$tmp_tgz"
          msg "WordPress dosyaları hazır."
        else
          warn "WordPress zaten kurulu görünüyor, indirme atlandı."
        fi

        if [[ ! -f "${site_root}/public/wp-config.php" ]]; then
          cp "${site_root}/public/wp-config-sample.php" "${site_root}/public/wp-config.php"
          sed -i "s/database_name_here/${db_name}/" "${site_root}/public/wp-config.php"
          sed -i "s/username_here/${db_user}/" "${site_root}/public/wp-config.php"
          sed -i "s/password_here/${db_password}/" "${site_root}/public/wp-config.php"
          msg "wp-config.php yazıldı."
        else
          warn "wp-config.php zaten var, üzerine yazılmadı."
        fi
      else
        linux_user="${6:-}"
        if [[ ! -f "${site_root}/public/index.php" ]]; then
          cat > "${site_root}/public/index.php" <<'PHP'
<?php
phpinfo();
PHP
        fi
      fi

      validate_username_optional "$linux_user"
      ensure_linux_user "$linux_user" "$site_root"
      [[ -n "$linux_user" ]] && chown -R "${linux_user}:${linux_user}" "$site_root"

      cat > "$conf" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${server_names};

  root ${site_root}/public;
  index index.php index.html;

  access_log /var/log/nginx/${domain}.access.log;
  error_log  /var/log/nginx/${domain}.error.log;
  client_max_body_size 50m;

  location / { try_files \$uri \$uri/ /index.php?\$args; }
  location ~ \.php\$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:${php_sock};
  }
  location ~* \.(css|js|jpg|jpeg|gif|png|svg|ico|webp|woff|woff2|ttf|eot)\$ {
    expires 30d;
    access_log off;
  }
}
NGINX
      ;;

    NODEJS|PYTHON)
      require_args 4 "$#" "create-vhost <domain> ${type} <www> <port>"
      local port="$4"
      validate_port "$port"

      cat > "$conf" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${server_names};

  access_log /var/log/nginx/${domain}.access.log;
  error_log  /var/log/nginx/${domain}.error.log;
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
      ;;

    REVERSE_PROXY)
      require_args 4 "$#" "create-vhost <domain> REVERSE_PROXY <www> <upstream_url>"
      local upstream="$4"
      [[ "$upstream" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%/-]*)?$ ]] \
        || die "Geçersiz upstream adresi: $upstream"

      cat > "$conf" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${server_names};

  access_log /var/log/nginx/${domain}.access.log;
  error_log  /var/log/nginx/${domain}.error.log;
  client_max_body_size 50m;

  location / {
    proxy_pass ${upstream};
    proxy_http_version 1.1;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
      ;;
  esac

  ln -sf "$conf" "/etc/nginx/sites-enabled/${domain}.conf"
  nginx_test_and_reload
  msg "Vhost hazır: ${domain} (${conf})"
}

# ------------------------------------------------------------
# update-upstream (yalnızca REVERSE_PROXY)
# ------------------------------------------------------------
# create-vhost'un aksine dosyayı TAMAMEN YENİDEN YAZMAZ (`cat >`) — yalnızca
# proxy_pass satırını değiştirir. Bunun sebebi: request-ssl `certbot --nginx`
# çalıştırıyor ve bu, vhost dosyasına doğrudan bir 443/SSL server bloğu
# ekliyor (bkz. cmd_request_ssl) — dosyayı yeniden yazmak o bloğu silip
# siteyi HTTPS'siz bırakır. CloudPanel-tarzı akışta (git ile deploy edilen
# uygulama hangi porttan ayağa kalkarsa proxy'yi oraya çekmek) bu komut SSL
# aktifken de güvenle çağrılabilmeli.
cmd_update_upstream() {
  require_args 2 "$#" "update-upstream <domain> <upstream_url>"
  local domain="$1" upstream="$2"
  validate_domain "$domain"
  [[ "$upstream" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%/-]*)?$ ]] \
    || die "Geçersiz upstream adresi: $upstream"

  local conf="/etc/nginx/sites-available/${domain}.conf"
  [[ -f "$conf" ]] || die "Vhost bulunamadı: ${domain} (önce site oluşturulmalı)"
  grep -q "proxy_pass " "$conf" || die "Bu vhost bir reverse-proxy yapılandırması değil: ${domain}"

  sed -i "s#proxy_pass .*;#proxy_pass ${upstream};#g" "$conf"

  nginx_test_and_reload
  msg "Upstream güncellendi: ${domain} -> ${upstream}"
}

# ------------------------------------------------------------
# remove-vhost
# ------------------------------------------------------------
cmd_remove_vhost() {
  local domain="$1"
  validate_domain "$domain"
  rm -f "/etc/nginx/sites-enabled/${domain}.conf"
  rm -f "/etc/nginx/sites-available/${domain}.conf"
  local nginx_test_log
  nginx_test_log="$(mktemp)"
  if nginx -t 2>"$nginx_test_log"; then
    systemctl reload nginx
    rm -f "$nginx_test_log"
  else
    warn "Vhost kaldırıldı ama nginx -t başarısız oldu (başka bir sorun olabilir), reload atlandı:"
    cat "$nginx_test_log" >&2
    rm -f "$nginx_test_log"
  fi
  msg "Vhost kaldırıldı: ${domain}"
}

# ------------------------------------------------------------
# request-ssl
# ------------------------------------------------------------
cmd_request_ssl() {
  require_args 2 "$#" "request-ssl <domain> <email> [www:true|false]"
  local domain="$1" email="$2" www="${3:-false}"
  validate_domain "$domain"
  validate_email "$email"
  validate_www_flag "$www"
  command -v certbot >/dev/null 2>&1 || die "certbot bulunamadı (bkz. docs/certbot-kurulum.md)."

  local args=(-d "$domain")
  [[ "$www" == "true" ]] && args+=(-d "www.$domain")

  certbot --nginx "${args[@]}" --non-interactive --agree-tos -m "$email" --redirect
  msg "SSL sertifikası alındı: ${domain}"
}

# ------------------------------------------------------------
# create-service / remove-service / service-action / service-status / service-logs
# ------------------------------------------------------------
cmd_create_service() {
  require_args 4 "$#" "create-service <domain> <working_dir> <start_command> <port>"
  local domain="$1" working_dir="$2" start_command="$3" port="$4"
  validate_domain "$domain"
  validate_abs_path "$working_dir" "çalışma dizini"
  validate_start_command "$start_command"
  validate_port "$port"

  local slug unit
  slug="$(domain_slug "$domain")"
  [[ "$slug" =~ $SLUG_RE ]] || die "Geçersiz servis kimliği (domain'den türetildi): $slug"
  unit="/etc/systemd/system/site-${slug}.service"

  mkdir -p "$working_dir"
  chown panel:panel "$working_dir" 2>/dev/null || true

  cat > "$unit" <<UNIT
[Unit]
Description=Site: ${domain}
After=network.target

[Service]
Type=simple
User=panel
WorkingDirectory=${working_dir}
Environment=PORT=${port}
ExecStart=/bin/bash -lc '${start_command}'
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

  systemctl daemon-reload
  systemctl enable "site-${slug}.service" >/dev/null
  systemctl restart "site-${slug}.service"
  msg "Servis hazır: site-${slug}.service"
}

cmd_remove_service() {
  local domain="$1"
  validate_domain "$domain"
  local slug unit
  slug="$(domain_slug "$domain")"
  unit="/etc/systemd/system/site-${slug}.service"

  systemctl stop "site-${slug}.service" 2>/dev/null || true
  systemctl disable "site-${slug}.service" 2>/dev/null || true
  rm -f "$unit"
  systemctl daemon-reload
  msg "Servis kaldırıldı: site-${slug}.service"
}

cmd_service_action() {
  require_args 2 "$#" "service-action <domain> <start|stop|restart>"
  local domain="$1" action="$2"
  validate_domain "$domain"
  case "$action" in
    start|stop|restart) ;;
    *) die "Geçersiz eylem (start|stop|restart olmalı): $action" ;;
  esac
  local slug
  slug="$(domain_slug "$domain")"
  systemctl "$action" "site-${slug}.service"
  msg "site-${slug}.service: ${action} tamamlandı."
}

cmd_service_status() {
  local domain="$1"
  validate_domain "$domain"
  local slug
  slug="$(domain_slug "$domain")"
  systemctl is-active "site-${slug}.service" 2>/dev/null || true
}

cmd_service_logs() {
  require_args 2 "$#" "service-logs <domain> <lines>"
  local domain="$1" lines="$2"
  validate_domain "$domain"
  validate_lines "$lines"
  local slug
  slug="$(domain_slug "$domain")"
  journalctl -u "site-${slug}.service" -n "$lines" --no-pager
}

# ------------------------------------------------------------
# create-wp-db
# ------------------------------------------------------------
cmd_create_wp_db() {
  require_args 4 "$#" "create-wp-db <domain> <db_name> <db_user> <db_password>"
  local domain="$1" db_name="$2" db_user="$3" db_password="$4"
  validate_domain "$domain"
  validate_db_ident "$db_name" "veritabanı adı"
  validate_db_ident "$db_user" "veritabanı kullanıcısı"
  validate_db_password "$db_password"
  command -v mysql >/dev/null 2>&1 || die "mysql istemcisi bulunamadı (MySQL/MariaDB kurulu mu?)."

  mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${db_name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${db_user}'@'localhost' IDENTIFIED BY '${db_password}';
ALTER USER '${db_user}'@'localhost' IDENTIFIED BY '${db_password}';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'localhost';
FLUSH PRIVILEGES;
SQL
  msg "WordPress veritabanı hazır: ${db_name} (kullanıcı: ${db_user})"
}

# ------------------------------------------------------------
# configure-panel-domain / request-panel-ssl / remove-panel-domain
#
# Panelin KENDI arayuzunu (varsayilan :24428, bkz. install.sh) EK olarak bir
# alan adi + gercek Let's Encrypt sertifikasi uzerinden erisilebilir kilar.
# panel.conf'a (mevcut :24428 vhost'u) HIC DOKUNULMAZ -- o her zaman
# IP-tabanli/yedek erisim yolu olarak kalir. Bunun yerine iki ayri dosya
# yazilir: PANEL_DOMAIN_HTTP_CONF (port 80, yalniz bu alan adi icin -- ACME
# HTTP-01 dogrulamasi + gercek trafik icin https'e yonlendirme) ve
# PANEL_DOMAIN_SSL_CONF (port 443, sertifika alindiktan SONRA yazilir).
#
# `certbot --nginx` (auto-edit installer) BILEREK KULLANILMADI: panelin
# kendi vhost'u standart olmayan sabit bir portta (24428) dinliyor ve
# certbot'un nginx eklentisinin ozel portlarda "listen" satirini nasil
# secmesi gerektigi resmi dokumantasyonda acik degil -- bu port'a
# dokunulmasi riskli. Bunun yerine `certbot certonly --webroot` ile YALNIZCA
# sertifika dosyalari alinir (nginx config'i hic degistirilmez), SSL vhost'u
# port 443'te (standart) elle yazilir -- boylece hem certbot'un port
# davranisi belirsizligi tamamen ortadan kalkar hem de "bir alan adi baglandi
# -> https://alanadi (standart port, hicbir ozel port hatirlanmaz)" gibi
# beklenen kullanici deneyimi elde edilir. --deploy-hook ile her otomatik
# yenilemede (certbot.timer) nginx reload ZORUNLU: nginx sertifika
# dosyalarini yalnizca baslangicta/reload'da bellege okur, dosya diskte
# degisince kendiliginden yeniden okumaz.
# ------------------------------------------------------------
PANEL_DOMAIN_HTTP_CONF="/etc/nginx/sites-available/panel-domain.conf"
PANEL_DOMAIN_SSL_CONF="/etc/nginx/sites-available/panel-domain-ssl.conf"
PANEL_ACME_WEBROOT="/var/www/certbot"

# Panelin dahili proxy portunu panel.conf'tan okur. install.sh PANEL_PORT'u
# kurulum aninda panel.conf'a literal deger olarak gomer (degiskeni
# calisirken tekrar okuyamayiz) -- ozel bir PANEL_PORT ile kurulmus olsa
# bile burada dogru degeri kullanmak icin gercek dosyadan cikariyoruz.
panel_upstream_port() {
  local port
  port="$(sed -n 's#.*proxy_pass http://127\.0\.0\.1:\([0-9]*\);.*#\1#p' /etc/nginx/sites-available/panel.conf 2>/dev/null | head -1)"
  [[ -n "$port" ]] || port=3000
  echo "$port"
}

cmd_configure_panel_domain() {
  require_args 1 "$#" "configure-panel-domain <domain>"
  local domain="$1"
  validate_domain "$domain"

  mkdir -p "${PANEL_ACME_WEBROOT}"

  cat > "$PANEL_DOMAIN_HTTP_CONF" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${domain};

  location /.well-known/acme-challenge/ {
    root ${PANEL_ACME_WEBROOT};
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}
NGINX
  ln -sf "$PANEL_DOMAIN_HTTP_CONF" "/etc/nginx/sites-enabled/panel-domain.conf"
  nginx_test_and_reload
  msg "Panel alan adi (HTTP/ACME) hazir: ${domain}"
}

cmd_request_panel_ssl() {
  require_args 2 "$#" "request-panel-ssl <domain> <email>"
  local domain="$1" email="$2"
  validate_domain "$domain"
  validate_email "$email"
  command -v certbot >/dev/null 2>&1 || die "certbot bulunamadi (bkz. docs/certbot-kurulum.md)."
  [[ -f "$PANEL_DOMAIN_HTTP_CONF" ]] || die "Once configure-panel-domain calistirilmali."

  certbot certonly --webroot -w "${PANEL_ACME_WEBROOT}" \
    -d "$domain" \
    --non-interactive --agree-tos -m "$email" \
    --deploy-hook "systemctl reload nginx"

  local cert_dir="/etc/letsencrypt/live/${domain}"
  [[ -f "${cert_dir}/fullchain.pem" && -f "${cert_dir}/privkey.pem" ]] \
    || die "Sertifika alindi ama beklenen dosyalar bulunamadi: ${cert_dir}"

  local upstream_port
  upstream_port="$(panel_upstream_port)"

  cat > "$PANEL_DOMAIN_SSL_CONF" <<NGINX
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${domain};

  ssl_certificate     ${cert_dir}/fullchain.pem;
  ssl_certificate_key ${cert_dir}/privkey.pem;

  access_log /var/log/nginx/panel-domain.access.log;
  error_log  /var/log/nginx/panel-domain.error.log;
  client_max_body_size 200m;

  location / {
    proxy_pass http://127.0.0.1:${upstream_port};
    proxy_http_version 1.1;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
  ln -sf "$PANEL_DOMAIN_SSL_CONF" "/etc/nginx/sites-enabled/panel-domain-ssl.conf"
  nginx_test_and_reload
  msg "SSL sertifikasi alindi, panel https://${domain} uzerinden aktif."
}

cmd_remove_panel_domain() {
  rm -f "/etc/nginx/sites-enabled/panel-domain.conf" "/etc/nginx/sites-enabled/panel-domain-ssl.conf"
  rm -f "$PANEL_DOMAIN_HTTP_CONF" "$PANEL_DOMAIN_SSL_CONF"
  local nginx_test_log
  nginx_test_log="$(mktemp)"
  if nginx -t 2>"$nginx_test_log"; then
    systemctl reload nginx
    rm -f "$nginx_test_log"
  else
    warn "Panel alan adi vhost'lari kaldirildi ama nginx -t basarisiz oldu, reload atlandi:"
    cat "$nginx_test_log" >&2
    rm -f "$nginx_test_log"
  fi
  msg "Panel alan adi baglantisi kaldirildi (panel :24428 uzerinden erisilebilir olmaya devam eder)."
}

# ------------------------------------------------------------
# Dispatch
# ------------------------------------------------------------
usage() {
  cat <<USAGE
Kullanım: provision-site.sh <alt-komut> [argümanlar...]

Alt komutlar:
  create-vhost <domain> <type> <www> ...        Nginx vhost yaz + reload
  update-upstream <domain> <upstream_url>        REVERSE_PROXY hedef adresini güncelle
  remove-vhost <domain>                          Nginx vhost kaldır + reload
  request-ssl <domain> <email> [www]             certbot --nginx ile SSL al
  create-service <domain> <dir> <cmd> <port>     systemd birimi oluştur + başlat
  remove-service <domain>                        systemd birimini durdur + kaldır
  service-action <domain> <start|stop|restart>   systemd birimini kontrol et
  service-status <domain>                        systemd durumunu yazdır
  service-logs <domain> <lines>                  journalctl loglarını yazdır
  create-wp-db <domain> <db_name> <db_user> <db_password>   MySQL DB+user oluştur
  configure-panel-domain <domain>                Panel icin alan adi (HTTP+ACME) yapılandır
  request-panel-ssl <domain> <email>             Panel alan adı için gerçek SSL al (Let's Encrypt)
  remove-panel-domain                             Panel alan adı bağlantısını kaldır
USAGE
}

SUBCOMMAND="${1:-}"
[[ -n "$SUBCOMMAND" ]] || { usage; die "Alt komut belirtilmedi."; }
shift || true

case "$SUBCOMMAND" in
  create-vhost)    cmd_create_vhost "$@" ;;
  update-upstream) cmd_update_upstream "$@" ;;
  remove-vhost)    require_args 1 "$#" "remove-vhost <domain>"; cmd_remove_vhost "$@" ;;
  request-ssl)     cmd_request_ssl "$@" ;;
  create-service)  cmd_create_service "$@" ;;
  remove-service)  require_args 1 "$#" "remove-service <domain>"; cmd_remove_service "$@" ;;
  service-action)  cmd_service_action "$@" ;;
  service-status)  require_args 1 "$#" "service-status <domain>"; cmd_service_status "$@" ;;
  service-logs)    cmd_service_logs "$@" ;;
  create-wp-db)    cmd_create_wp_db "$@" ;;
  configure-panel-domain) require_args 1 "$#" "configure-panel-domain <domain>"; cmd_configure_panel_domain "$@" ;;
  request-panel-ssl)      require_args 2 "$#" "request-panel-ssl <domain> <email>"; cmd_request_panel_ssl "$@" ;;
  remove-panel-domain)    cmd_remove_panel_domain "$@" ;;
  -h|--help|help)  usage ;;
  *) usage; die "Bilinmeyen alt komut: ${SUBCOMMAND}" ;;
esac
