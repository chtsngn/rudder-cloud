#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — provision-site.sh
#
# Panel süreci (unprivileged `panel` sistem kullanıcısı) tarafından
# `sudo` ile çağrılan TEK ayrıcalıklı betik. nginx/certbot/kullanıcı
# yönetimi gibi kök yetkisi gerektiren TÜM site provisioning işlemleri buradan
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
USERNAME_RE='^[a-z][a-z0-9_-]{0,31}$'
ABS_PATH_RE='^/[A-Za-z0-9_./-]+$'
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

# 2026-10-11 (v1.4.0): yalnızca iki tür — STATIC ve REVERSE_PROXY ("Uygulama";
# Docker Compose bunun süreç yöneticisi). PHP/WordPress/Node.js/Python ve
# ayrı DOCKER türü kaldırıldı.
validate_site_type() {
  case "$1" in
    STATIC|REVERSE_PROXY) ;;
    *) die "Geçersiz site türü: $1" ;;
  esac
}

validate_bool() {
  local v="$1" label="$2"
  case "$v" in
    true|false) ;;
    *) die "${label} 'true' ya da 'false' olmalı: $v" ;;
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
  # `siteusers` grubu (doctor.sh tarafından oluşturulur) — panelin site
  # bazlı terminal izolasyonu (bkz. doctor.sh Aşama I notu, server.mjs)
  # yalnızca BU gruptaki kullanıcılara sudo izni veriyor; her dedicated site
  # kullanıcısı burada eklenir ki MEMBER'lara TERMINAL izni verilebilsin.
  # Grup henüz yoksa (eski bir doctor.sh ile kurulmuş sunucu) sessizce atla —
  # terminal özelliği o durumda devre dışı kalır, provisioning'i engellemez.
  usermod -aG siteusers "$user" 2>/dev/null || true
}

# `ensure_linux_user`'ın STATIC'te yaptığı TAM sahiplik devrinden
# (`chown user:user`) BİLEREK FARKLI: REVERSE_PROXY (Uygulama) site
# klasörünü panelin KENDİSİ — Dosya Yöneticisi, git pull, docker compose —
# `panel` olarak okuyup yazıyor. Bu yüzden sahiplik `panel`'den ALINAMAZ; onun
# yerine klasörün GRUBU dedicated kullanıcının kendi grubuna çevrilip grup
# rwx + setgid (yeni dosyalar da aynı grubu miras alsın diye) veriliyor —
# `panel` sahip olarak zaten tam erişimini korur, dedicated kullanıcı SADECE
# bu klasörde (grup üzerinden) gerçek okuma/yazma kazanır, başka hiçbir
# sitenin klasörüne grup üyeliği yoluyla bile erişemez (her site kendi
# TEK KİŞİLİK grubunu kullanır — `adduser`'ın varsayılan davranışı).
grant_shared_process_isolation() {
  local linux_user="$1" workdir="$2"
  [[ -z "$linux_user" ]] && return 0
  chown -R "panel:${linux_user}" "$workdir"
  chmod -R u+rwX,g+rwX "$workdir"
  find "$workdir" -type d -exec chmod g+s {} +
  # `o-rwx` AÇIKÇA — üst dizinin zaten "diğerleri" için erişimi kapalı olması
  # (bu klasör her zaman `panel:panel` 0700-yakını bir üst dizin altında,
  # /var/www/<domain> kendisi de mkdir'in varsayılan umask'ı ile genelde
  # traversal'ı zaten engelliyor) TESADÜFE bırakılmıyor — `git clone`/`rsync`
  # gibi işlemler alt dosya/dizinleri farklı bir umask ile (ör. dünyaya
  # okunabilir 0755/0644) oluşturabiliyor; bu satır TÜM ağacı, üst dizinin
  # davranışından bağımsız olarak, açıkça dünyaya kapatıyor.
  chmod -R o-rwx "$workdir"
}

cmd_ensure_site_user() {
  require_args 3 "$#" "ensure-site-user <domain> <workdir> <linux_user> [model:shared|owned]"
  local domain="$1" workdir="$2" linux_user="$3" model="${4:-shared}"
  validate_domain "$domain"
  validate_abs_path "$workdir" "çalışma dizini"
  [[ "$linux_user" =~ $USERNAME_RE ]] || die "Geçersiz linux kullanıcı adı: $linux_user"
  case "$model" in
    shared)
      # REVERSE_PROXY (Uygulama): klasör panel'de kalır, kullanıcı grup üzerinden erişir.
      mkdir -p "$workdir"
      ensure_linux_user "$linux_user" "$workdir"
      grant_shared_process_isolation "$linux_user" "$workdir"
      ;;
    owned)
      # STATIC: klasör kullanıcıya ait; panel/nginx ACL ile erişir.
      validate_site_root "$workdir"
      mkdir -p "${workdir}/public"
      apply_owned_site_access "$linux_user" "$workdir"
      ;;
    *) die "Geçersiz model (shared|owned olmalı): $model" ;;
  esac
  msg "Site kullanıcısı hazır: ${linux_user} (${workdir}, ${model})"
}

# STATIC için sahiplik modeli (2026-09-15): dosyalar dedicated kullanıcıya
# ait. Panelin dosya yöneticisi/git yayını ve nginx'in okuma
# erişimi ACL ile verilir — grup üyeliği değil, çünkü ACL anında etkili olur
# (grup üyeliği panel.service yeniden başlamadan işlemez). `g+rwX` KASITLI:
# ACL "mask"ı grup bitlerinden türer, grup salt-okunur olsaydı panelin rwX
# ACL'si de salt-okunura düşerdi. setfacl yoksa (acl paketi) grup üyeliğine
# düşülür ve uyarı verilir.
apply_owned_site_access() {
  local user="$1" site_root="$2"
  [[ -z "$user" ]] && return 0
  ensure_linux_user "$user" "$site_root"
  chown -R "${user}:${user}" "$site_root"
  chmod -R u+rwX,g+rwX,o-rwx "$site_root"
  find "$site_root" -type d -exec chmod g+s {} +
  local acl_ok=0
  if command -v setfacl >/dev/null 2>&1; then
    if setfacl -R -m "u:panel:rwX,d:u:panel:rwX,u:www-data:rX,d:u:www-data:rX" "$site_root" 2>/dev/null; then
      acl_ok=1
    fi
  fi
  if (( acl_ok == 0 )); then
    warn "ACL uygulanamadı (setfacl yok ya da dosya sistemi desteklemiyor) — panel ve www-data '${user}' grubuna ekleniyor; panel.service yeniden başlatılana kadar dosya yöneticisi yazamayabilir."
    usermod -aG "$user" www-data 2>/dev/null || true
    usermod -aG "$user" panel 2>/dev/null || true
  fi
}

# ------------------------------------------------------------
# pm2-action — PM2 ile yönetilen süreçler ROOT'un pm2 daemon'ında yaşar
# (web terminali root; kullanıcı pm2'yi oradan başlatır). Panel kullanıcısı
# olarak `pm2 restart` o daemon'ı hiç göremezdi — bu yüzden buradan (root).
# ------------------------------------------------------------
cmd_pm2_action() {
  require_args 3 "$#" "pm2-action <domain> <process_name> <start|stop|restart|reload|delete|describe>"
  local domain="$1" name="$2" action="$3"
  validate_domain "$domain"
  [[ "$name" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "Geçersiz PM2 süreç adı: $name"
  case "$action" in
    start|stop|restart|reload|delete|describe) ;;
    *) die "Geçersiz pm2 eylemi: $action" ;;
  esac
  local pm2_bin
  pm2_bin="$(command -v pm2 2>/dev/null || true)"
  local c
  for c in /usr/local/bin/pm2 /usr/bin/pm2 /usr/local/lib/node_modules/pm2/bin/pm2; do
    [[ -z "$pm2_bin" && -x "$c" ]] && pm2_bin="$c"
  done
  [[ -n "$pm2_bin" ]] || die "pm2 bulunamadı (root için PATH'te değil). Sunucuda 'npm install -g pm2' ile kurun."
  if [[ "$action" == "describe" ]]; then
    "$pm2_bin" jlist 2>/dev/null
    return 0
  fi
  "$pm2_bin" "$action" "$name"
  msg "pm2 ${action} ${name}: tamamlandı."
}

# ------------------------------------------------------------
# cleanup-site — site silinirken bırakılan artıkları kaldırır (isteğe bağlı):
# çalışan compose konteynerleri (portu tutmasın), klasör, dedicated kullanıcı. Kullanıcı yalnızca `siteusers` grubundaysa silinir
# (sistem hesapları/elle oluşturulmuş hesaplar ASLA).
# ------------------------------------------------------------
cmd_cleanup_site() {
  require_args 5 "$#" "cleanup-site <domain> <workdir> <linux_user|-> <remove_folder:true|false> <remove_user:true|false>"
  local domain="$1" workdir="$2" linux_user="$3" remove_folder="$4" remove_user="$5"
  validate_domain "$domain"
  validate_abs_path "$workdir" "çalışma dizini"
  [[ "$workdir" == /var/www/* ]] || die "Çalışma dizini /var/www/ altında olmalı: $workdir"
  [[ "$workdir" != "/var/www" && "$workdir" != "/var/www/" ]] || die "Kök dizin silinemez."
  case "$remove_folder" in true|false) ;; *) die "remove_folder true|false olmalı" ;; esac
  case "$remove_user" in true|false) ;; *) die "remove_user true|false olmalı" ;; esac

  if command -v docker >/dev/null 2>&1 && [[ -d "$workdir" ]]; then
    local cf
    for cf in docker-compose.yml compose.yml docker-compose.yaml compose.yaml; do
      if [[ -f "${workdir}/${cf}" ]]; then
        (cd "$workdir" && docker compose -f "$cf" down --remove-orphans) \
          && msg "Docker Compose konteynerleri durduruldu." \
          || warn "docker compose down başarısız oldu — konteynerler elle durdurulmalı."
        break
      fi
    done
  fi

  if [[ "$remove_folder" == "true" && -d "$workdir" ]]; then
    rm -rf -- "$workdir"
    msg "Klasör silindi: ${workdir}"
  fi

  if [[ "$remove_user" == "true" && "$linux_user" != "-" ]]; then
    [[ "$linux_user" =~ $USERNAME_RE ]] || die "Geçersiz linux kullanıcı adı: $linux_user"
    if id "$linux_user" >/dev/null 2>&1; then
      if id -nG "$linux_user" 2>/dev/null | grep -qw siteusers; then
        pkill -KILL -u "$linux_user" 2>/dev/null || true
        userdel "$linux_user" 2>/dev/null || warn "Kullanıcı silinemedi: ${linux_user}"
        getent group "$linux_user" >/dev/null 2>&1 && { groupdel "$linux_user" 2>/dev/null || true; }
        msg "Kullanıcı silindi: ${linux_user}"
      else
        warn "'${linux_user}' siteusers grubunda değil (panel oluşturmamış) — güvenlik için silinmedi."
      fi
    fi
  fi
  msg "Site temizliği tamamlandı: ${domain}"
}

# ------------------------------------------------------------
# refresh-cloudflare-ips — Cloudflare proxy'si arkasındaki sitelerde gerçek
# ziyaretçi IP'si (CF-Connecting-IP) için nginx real_ip ayarı. Yalnızca
# Cloudflare'ın yayınladığı aralıklara güvenilir; liste değişirse tekrar
# çalıştırılır (doctor.sh kurulumda, Ayarlar'daki buton istendiğinde).
# ------------------------------------------------------------
cmd_refresh_cloudflare_ips() {
  command -v curl >/dev/null 2>&1 || die "curl bulunamadı."
  local out="/etc/nginx/conf.d/rudder-cloudflare-realip.conf" tmp v4 v6 ip
  v4="$(curl -fsSL --max-time 15 https://www.cloudflare.com/ips-v4)" || die "Cloudflare IPv4 listesi alınamadı."
  v6="$(curl -fsSL --max-time 15 https://www.cloudflare.com/ips-v6)" || die "Cloudflare IPv6 listesi alınamadı."
  tmp="$(mktemp)"
  {
    echo "# Rudder Cloud — Cloudflare gerçek ziyaretçi IP'si (provision-site.sh refresh-cloudflare-ips, $(date -u +%Y-%m-%dT%H:%MZ))"
    for ip in $v4 $v6; do
      [[ "$ip" =~ ^[0-9a-fA-F:.]+/[0-9]{1,3}$ ]] || { rm -f "$tmp"; die "Beklenmeyen IP aralığı biçimi: $ip"; }
      echo "set_real_ip_from ${ip};"
    done
    echo "real_ip_header CF-Connecting-IP;"
  } > "$tmp"
  local prev=""
  [[ -f "$out" ]] && prev="$(mktemp)" && cp "$out" "$prev"
  install -m 0644 "$tmp" "$out"
  rm -f "$tmp"
  if ! nginx -t >/dev/null 2>&1; then
    if [[ -n "$prev" ]]; then mv "$prev" "$out"; else rm -f "$out"; fi
    die "nginx -t başarısız oldu, Cloudflare real_ip yapılandırması geri alındı."
  fi
  [[ -n "$prev" ]] && rm -f "$prev"
  systemctl reload nginx
  msg "Cloudflare IP aralıkları güncellendi: ${out}"
}

# ------------------------------------------------------------
# Statik sitenin `location /` satırı. `$uri.html`: uzantısız adresler
# (Next.js export, Astro: /hakkimizda -> hakkimizda.html). SPA modunda
# bulunamayan yol index.html'e düşer (istemci tarafı yönlendirme). İkisi de
# yalnız `public/` içinden dosya seçer — sunulan kapsamı genişletmez; nokta
# dosyaları ve hassas uzantılar yukarıdaki deny blokları ile yine kapalı.
# ------------------------------------------------------------
static_location_line() {
  if [[ "$1" == "true" ]]; then
    echo 'location / { try_files $uri $uri.html $uri/ /index.html; }'
  else
    echo 'location / { try_files $uri $uri.html $uri/ =404; }'
  fi
}

# ------------------------------------------------------------
# update-static-routing — STATIC vhost'unun `location /` satırını SPA
# moduna göre değiştirir. Dosyayı yeniden yazmaz (certbot'un eklediği 443
# bloğu korunur, bkz. cmd_update_upstream); v1.3.x'te yazılmış eski
# `try_files $uri $uri/ =404;` satırını da günceller.
# ------------------------------------------------------------
cmd_update_static_routing() {
  require_args 2 "$#" "update-static-routing <domain> <spa:true|false>"
  local domain="$1" spa="$2"
  validate_domain "$domain"
  validate_bool "$spa" "spa bayrağı"
  local conf="/etc/nginx/sites-available/${domain}.conf"
  [[ -f "$conf" ]] || die "Vhost bulunamadı: ${domain}"
  grep -q "^[[:space:]]*root .*/public;" "$conf" || die "Bu vhost bir statik site yapılandırması değil: ${domain}"
  grep -q "location / { try_files " "$conf" || die "Statik vhost'ta 'location / { try_files ... }' satırı bulunamadı: ${domain}"

  local line backup
  line="$(static_location_line "$spa")"
  backup="$(mktemp)"
  cp "$conf" "$backup"
  sed -i "s#location / { try_files [^}]*}#${line}#g" "$conf"
  if ! nginx -t >/dev/null 2>&1; then
    cp "$backup" "$conf"
    rm -f "$backup"
    die "nginx -t başarısız oldu, yönlendirme değişikliği geri alındı."
  fi
  rm -f "$backup"
  systemctl reload nginx
  msg "Statik yönlendirme güncellendi: ${domain} (SPA: ${spa})"
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
      require_args 4 "$#" "create-vhost <domain> STATIC <www> <site_root> [linux_user] [spa:true|false]"
      local site_root="$4" linux_user="${5:-}" spa="${6:-false}"
      validate_site_root "$site_root"
      validate_username_optional "$linux_user"
      validate_bool "$spa" "spa bayrağı"

      mkdir -p "${site_root}/public"
      if [[ ! -f "${site_root}/public/index.html" ]]; then
        cat > "${site_root}/public/index.html" <<HTML
<!doctype html>
<html><head><meta charset="utf-8"><title>${domain}</title></head>
<body><h1>OK - ${domain}</h1></body></html>
HTML
      fi
      apply_owned_site_access "$linux_user" "$site_root"

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

  location ~ /\.(?!well-known) {
    deny all;
    access_log off;
    log_not_found off;
  }

  location ~* \.(env|ya?ml|ini|log|sql|sqlite3?|bak|swp|lock|conf)\$ {
    deny all;
    access_log off;
    log_not_found off;
  }

  $(static_location_line "$spa")
}
NGINX
      ;;

    REVERSE_PROXY)
      require_args 4 "$#" "create-vhost <domain> REVERSE_PROXY <www> <upstream_url> [linux_user] [compose_port]"
      local upstream="$4" linux_user="${5:-}" compose_port="${6:-}"
      [[ "$upstream" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~%/-]*)?$ ]] \
        || die "Geçersiz upstream adresi: $upstream"
      [[ -n "$linux_user" ]] && [[ ! "$linux_user" =~ $USERNAME_RE ]] && die "Geçersiz linux kullanıcı adı: $linux_user"
      [[ -n "$compose_port" ]] && validate_port "$compose_port"

      # Uygulama klasörü — panelin dosya yöneticisi, git clone ve docker
      # compose burada çalışır (bkz. src/lib/site-paths.ts resolveSiteWorkdir).
      # nginx bu klasörü hiç sunmaz, yalnızca proxy_pass.
      local reverse_proxy_root="/var/www/${domain}"
      mkdir -p "$reverse_proxy_root"
      chown panel:panel "$reverse_proxy_root" 2>/dev/null || true
      # `o-rwx` KOŞULSUZ — `linux_user` henüz atanmamış olsa BİLE, bu klasör
      # nginx tarafından hiç DOĞRUDAN sunulmuyor (yalnızca proxy_pass), o
      # yüzden dünyaya açık kalmasının hiçbir meşru sebebi yok. Bu olmadan,
      # BAŞKA bir sitenin dedicated kullanıcısı (siteusers grubundaki HERKES)
      # bu klasörü hâlâ okuyabilirdi — bkz. docs/ARCHITECTURE.md 2026-09-08.
      chmod o-rwx "$reverse_proxy_root" 2>/dev/null || true
      # compose_port verildiyse (repo bağlanmadan Docker Compose seçildi): örnek
      # bir docker-compose.yml yaz ve ayağa kaldır — site ilk andan yanıt versin.
      # Depo bağlanacaksa çağıran bunu boş bırakır; gerçek compose klonlanır.
      if [[ -n "$compose_port" ]]; then
        if [[ ! -f "${reverse_proxy_root}/docker-compose.yml" && ! -f "${reverse_proxy_root}/compose.yml" \
              && ! -f "${reverse_proxy_root}/docker-compose.yaml" && ! -f "${reverse_proxy_root}/compose.yaml" ]]; then
          cat > "${reverse_proxy_root}/docker-compose.yml" <<COMPOSE
services:
  app:
    image: nginx:alpine
    ports:
      - "127.0.0.1:${compose_port}:80"
    restart: unless-stopped
COMPOSE
          chown panel:panel "${reverse_proxy_root}/docker-compose.yml" 2>/dev/null || true
          msg "Örnek docker-compose.yml oluşturuldu: ${reverse_proxy_root}/docker-compose.yml"
        else
          warn "docker-compose.yml zaten mevcut, üzerine yazılmadı."
        fi
      fi
      if [[ -n "$linux_user" ]]; then
        ensure_linux_user "$linux_user" "$reverse_proxy_root"
        grant_shared_process_isolation "$linux_user" "$reverse_proxy_root"
      fi

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
      if [[ -n "$compose_port" ]]; then
        if command -v docker >/dev/null 2>&1; then
          (cd "$reverse_proxy_root" && docker compose up -d --remove-orphans) >/dev/null 2>&1 \
            && msg "Docker Compose başlatıldı." \
            || warn "docker compose up başarısız oldu — compose dosyasını kontrol edin."
        else
          warn "docker komutu bulunamadı. docker-compose.yml oluşturuldu ama konteyner başlatılmadı."
        fi
      fi
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
  update-static-routing <domain> <spa>           STATIC yönlendirmesi (SPA modu true|false)
  remove-vhost <domain>                          Nginx vhost kaldır + reload
  request-ssl <domain> <email> [www]             certbot --nginx ile SSL al
  configure-panel-domain <domain>                Panel icin alan adi (HTTP+ACME) yapılandır
  request-panel-ssl <domain> <email>             Panel alan adı için gerçek SSL al (Let's Encrypt)
  remove-panel-domain                             Panel alan adı bağlantısını kaldır
  ensure-site-user <domain> <workdir> <user> [shared|owned]
                                                 Dedicated Linux kullanıcısı kur: shared =
                                                 Uygulama (klasör panel'de, grup erişimi);
                                                 owned = Statik (klasör kullanıcıda, ACL)
  pm2-action <domain> <name> <action>            Root'un pm2 daemon'ında start|stop|restart|reload|delete|describe
  cleanup-site <domain> <workdir> <user|-> <rm_folder> <rm_user>
                                                 Site silme artıkları: compose down, klasör, kullanıcı
  refresh-cloudflare-ips                         Nginx real_ip için Cloudflare IP aralıklarını yenile
USAGE
}

SUBCOMMAND="${1:-}"
[[ -n "$SUBCOMMAND" ]] || { usage; die "Alt komut belirtilmedi."; }
shift || true

case "$SUBCOMMAND" in
  create-vhost)    cmd_create_vhost "$@" ;;
  update-upstream) cmd_update_upstream "$@" ;;
  update-static-routing) cmd_update_static_routing "$@" ;;
  remove-vhost)    require_args 1 "$#" "remove-vhost <domain>"; cmd_remove_vhost "$@" ;;
  request-ssl)     cmd_request_ssl "$@" ;;
  configure-panel-domain) require_args 1 "$#" "configure-panel-domain <domain>"; cmd_configure_panel_domain "$@" ;;
  request-panel-ssl)      require_args 2 "$#" "request-panel-ssl <domain> <email>"; cmd_request_panel_ssl "$@" ;;
  remove-panel-domain)    cmd_remove_panel_domain "$@" ;;
  ensure-site-user)       cmd_ensure_site_user "$@" ;;
  pm2-action)             cmd_pm2_action "$@" ;;
  cleanup-site)           cmd_cleanup_site "$@" ;;
  refresh-cloudflare-ips) cmd_refresh_cloudflare_ips "$@" ;;
  -h|--help|help)  usage ;;
  *) usage; die "Bilinmeyen alt komut: ${SUBCOMMAND}" ;;
esac
