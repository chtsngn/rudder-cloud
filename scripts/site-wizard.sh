#!/usr/bin/env bash
set -euo pipefail

# =========================================================
# Site Wizard - Nginx tabanlı 6 tip site kurulum scripti
# WordPress | PHP | Node.js | Static | Python | Reverse Proxy
# =========================================================

# --------- Helpers ---------
msg(){ echo -e "✅ $*"; }
warn(){ echo -e "⚠️  $*" >&2; }
die(){ echo -e "❌ $*" >&2; exit 1; }

need_cmd(){ command -v "$1" >/dev/null 2>&1 || die "Komut bulunamadı: $1"; }

ask() {
  local prompt="$1" default="${2:-}" var
  if [[ -n "$default" ]]; then
    read -r -p "$prompt [$default]: " var
    echo "${var:-$default}"
  else
    read -r -p "$prompt: " var
    echo "$var"
  fi
}

ask_yesno() {
  local prompt="$1" default="${2:-y}" ans
  read -r -p "$prompt (y/n) [$default]: " ans
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[Yy]$ ]] && echo "true" || echo "false"
}

ensure_nginx_site_enabled() {
  local conf="$1" domain="$2"
  ln -sf "$conf" "/etc/nginx/sites-enabled/${domain}.conf"
  nginx -t
  systemctl reload nginx
}

write_nginx_http_vhost() {
  local domain="$1" server_names="$2" root="$3" extra="$4"
  local conf="/etc/nginx/sites-available/${domain}.conf"
  cat > "$conf" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${server_names};

  root ${root};
  index index.html index.php;

  access_log /var/log/nginx/${domain}.access.log;
  error_log  /var/log/nginx/${domain}.error.log;

  client_max_body_size 50m;

  ${extra}
}
NGINX
  ensure_nginx_site_enabled "$conf" "$domain"
  msg "Nginx vhost yazıldı: $conf"
}

enable_ssl_certbot() {
  local domain="$1" server_names=("$@") # includes domain
  local email="$2"
  need_cmd certbot
  need_cmd python3

  # domain + opsiyonel www eklenmişse, certbot'a tüm -d'leri ver
  local args=()
  for d in "${server_names[@]:2}"; do args+=(-d "$d"); done

  msg "SSL alınıyor (certbot --nginx)..."
  certbot --nginx "${args[@]}" --non-interactive --agree-tos -m "$email" --redirect
  msg "SSL hazır."
}

ensure_user_and_dirs() {
  local user="$1" root="$2"
  mkdir -p "$root"
  if [[ -n "$user" ]]; then
    if ! id "$user" >/dev/null 2>&1; then
      adduser --disabled-password --gecos "" "$user"
      msg "User oluşturuldu: $user"
    fi
    chown -R "$user:$user" "$root"
  fi
}

# --------- Templates ---------

create_static_site() {
  local domain="$1" root="$2" with_www="$3" with_ssl="$4" email="$5" user="$6"
  local server_names="$domain"
  [[ "$with_www" == "true" ]] && server_names="$domain www.$domain"

  ensure_user_and_dirs "$user" "$root"
  mkdir -p "$root/public"

  if [[ ! -f "$root/public/index.html" ]]; then
    cat > "$root/public/index.html" <<HTML
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>$domain</title></head>
  <body><h1>OK - $domain</h1></body>
</html>
HTML
  fi

  write_nginx_http_vhost "$domain" "$server_names" "$root/public" \
'location / { try_files $uri $uri/ =404; }'

  if [[ "$with_ssl" == "true" ]]; then
    enable_ssl_certbot "$domain" "$email" $server_names
  fi
}

create_php_site() {
  local domain="$1" root="$2" php_ver="$3" with_www="$4" with_ssl="$5" email="$6" user="$7"
  local server_names="$domain"
  [[ "$with_www" == "true" ]] && server_names="$domain www.$domain"

  local php_sock="/run/php/php${php_ver}-fpm.sock"
  [[ -S "$php_sock" ]] || die "PHP-FPM sock yok: $php_sock (php${php_ver}-fpm kurulu mu?)"

  ensure_user_and_dirs "$user" "$root"
  mkdir -p "$root/public"

  if [[ ! -f "$root/public/index.php" ]]; then
    cat > "$root/public/index.php" <<PHP
<?php
phpinfo();
PHP
  fi

  write_nginx_http_vhost "$domain" "$server_names" "$root/public" \
"location / { try_files \$uri \$uri/ /index.php?\$query_string; }
location ~ \.php$ {
  include snippets/fastcgi-php.conf;
  fastcgi_pass unix:${php_sock};
}
location ~* \.(css|js|jpg|jpeg|gif|png|svg|ico|webp|woff|woff2|ttf|eot)$ { expires 30d; access_log off; }"

  if [[ "$with_ssl" == "true" ]]; then
    enable_ssl_certbot "$domain" "$email" $server_names
  fi
}

create_wordpress_site() {
  local domain="$1" root="$2" php_ver="$3" db_name="$4" db_user="$5" db_pass="$6" with_www="$7" with_ssl="$8" email="$9" user="${10}"
  local server_names="$domain"
  [[ "$with_www" == "true" ]] && server_names="$domain www.$domain"

  need_cmd mysql
  need_cmd curl
  need_cmd tar

  local php_sock="/run/php/php${php_ver}-fpm.sock"
  [[ -S "$php_sock" ]] || die "PHP-FPM sock yok: $php_sock (php${php_ver}-fpm kurulu mu?)"

  ensure_user_and_dirs "$user" "$root"
  mkdir -p "$root/public"

  # DB oluştur
  msg "DB oluşturuluyor (varsa atlanır)..."
  mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${db_name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${db_user}'@'localhost' IDENTIFIED BY '${db_pass}';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'localhost';
FLUSH PRIVILEGES;
SQL

  # WP indir
  if [[ ! -f "$root/public/wp-settings.php" ]]; then
    msg "WordPress indiriliyor..."
    curl -fsSL https://wordpress.org/latest.tar.gz -o /tmp/wp.tgz
    tar -xzf /tmp/wp.tgz -C /tmp
    rsync -a /tmp/wordpress/ "$root/public/"
    rm -rf /tmp/wordpress /tmp/wp.tgz
    msg "WordPress dosyaları hazır."
  else
    warn "WordPress zaten var görünüyor, indirme atlandı."
  fi

  # wp-config
  if [[ ! -f "$root/public/wp-config.php" ]]; then
    cp "$root/public/wp-config-sample.php" "$root/public/wp-config.php"
    sed -i "s/database_name_here/${db_name}/" "$root/public/wp-config.php"
    sed -i "s/username_here/${db_user}/" "$root/public/wp-config.php"
    sed -i "s/password_here/${db_pass}/" "$root/public/wp-config.php"
  fi

  write_nginx_http_vhost "$domain" "$server_names" "$root/public" \
"location / { try_files \$uri \$uri/ /index.php?\$args; }
location ~ \.php$ {
  include snippets/fastcgi-php.conf;
  fastcgi_pass unix:${php_sock};
}
location ~* \.(css|js|jpg|jpeg|gif|png|svg|ico|webp|woff|woff2|ttf|eot)$ { expires 30d; access_log off; }"

  if [[ "$with_ssl" == "true" ]]; then
    enable_ssl_certbot "$domain" "$email" $server_names
  fi
}

create_reverse_proxy() {
  local domain="$1" upstream="$2" with_www="$3" with_ssl="$4" email="$5"
  local server_names="$domain"
  [[ "$with_www" == "true" ]] && server_names="$domain www.$domain"

  write_nginx_http_vhost "$domain" "$server_names" "/var/www/empty" \
"location / {
  proxy_pass ${upstream};
  proxy_http_version 1.1;

  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;

  # websockets
  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection \"upgrade\";
}"
  if [[ "$with_ssl" == "true" ]]; then
    enable_ssl_certbot "$domain" "$email" $server_names
  fi
}

create_node_site() {
  local domain="$1" root="$2" port="$3" service_name="$4" with_www="$5" with_ssl="$6" email="$7"
  local server_names="$domain"
  [[ "$with_www" == "true" ]] && server_names="$domain www.$domain"

  # Node tarafını sen pm2/systemd ile zaten ayağa kaldırıyorsun diye varsayalım:
  # Bu template sadece reverse proxy yapar + opsiyonel SSL.
  write_nginx_http_vhost "$domain" "$server_names" "/var/www/empty" \
"location / {
  proxy_pass http://127.0.0.1:${port};
  proxy_http_version 1.1;

  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;

  proxy_set_header Upgrade \$http_upgrade;
  proxy_set_header Connection \"upgrade\";
}"
  msg "Node reverse proxy hazır: ${domain} -> 127.0.0.1:${port} (servis adı: ${service_name})"

  if [[ "$with_ssl" == "true" ]]; then
    enable_ssl_certbot "$domain" "$email" $server_names
  fi
}

create_python_site() {
  local domain="$1" root="$2" port="$3" with_www="$4" with_ssl="$5" email="$6" user="$7"
  local server_names="$domain"
  [[ "$with_www" == "true" ]] && server_names="$domain www.$domain"

  # Python app'i (gunicorn/uvicorn) sen ayrı çalıştıracaksın.
  # Bu template reverse proxy + opsiyonel SSL.
  ensure_user_and_dirs "$user" "$root"
  write_nginx_http_vhost "$domain" "$server_names" "/var/www/empty" \
"location / {
  proxy_pass http://127.0.0.1:${port};
  proxy_http_version 1.1;

  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
}"
  msg "Python reverse proxy hazır: ${domain} -> 127.0.0.1:${port}"

  if [[ "$with_ssl" == "true" ]]; then
    enable_ssl_certbot "$domain" "$email" $server_names
  fi
}

# --------- Wizard UI ---------
main() {
  [[ $EUID -eq 0 ]] || die "Bunu sudo/root ile çalıştır."

  need_cmd nginx
  systemctl is-active --quiet nginx || warn "nginx aktif değil gibi, ama devam ediyorum."

  echo
  echo "=============================="
  echo "   Nginx Site Wizard (6 tip)  "
  echo "=============================="
  echo "1) WordPress"
  echo "2) PHP"
  echo "3) Node.js (Reverse Proxy)"
  echo "4) Static HTML"
  echo "5) Python (Reverse Proxy)"
  echo "6) Reverse Proxy (Genel)"
  echo

  local choice
  choice="$(ask "Seçim (1-6)" "4")"

  local domain root with_www with_ssl email user
  domain="$(ask "Domain (örn: example.com)")"
  [[ -n "$domain" ]] || die "domain boş olamaz"

  with_www="$(ask_yesno "www.${domain} da eklensin mi?" "n")"
  with_ssl="$(ask_yesno "SSL (Let's Encrypt) alınsın mı?" "y")"
  email=""
  if [[ "$with_ssl" == "true" ]]; then
    email="$(ask "SSL için e-posta" "admin@${domain}")"
  fi

  case "$choice" in
    1)
      local php_ver db_name db_user db_pass
      php_ver="$(ask "PHP versiyonu (örn: 8.2 / 8.3)" "8.3")"
      root="$(ask "Site root" "/var/www/${domain}")"
      user="$(ask "Linux user (boş bırak: oluşturma)" "")"

      db_name="$(ask "DB adı" "${domain//./_}")"
      db_user="$(ask "DB user" "${db_name}_u")"
      db_pass="$(ask "DB şifre" "")"
      [[ -n "$db_pass" ]] || die "DB şifre boş olamaz (en azından burada)"

      create_wordpress_site "$domain" "$root" "$php_ver" "$db_name" "$db_user" "$db_pass" "$with_www" "$with_ssl" "$email" "$user"
      ;;
    2)
      local php_ver
      php_ver="$(ask "PHP versiyonu (örn: 8.2 / 8.3)" "8.3")"
      root="$(ask "Site root" "/var/www/${domain}")"
      user="$(ask "Linux user (boş bırak: oluşturma)" "")"
      create_php_site "$domain" "$root" "$php_ver" "$with_www" "$with_ssl" "$email" "$user"
      ;;
    3)
      local port service_name
      root="/var/www/${domain}"
      port="$(ask "Node app port (örn: 3000)" "3000")"
      service_name="$(ask "Servis adı (bilgi amaçlı)" "${domain//./-}")"
      create_node_site "$domain" "$root" "$port" "$service_name" "$with_www" "$with_ssl" "$email"
      ;;
    4)
      root="$(ask "Site root" "/var/www/${domain}")"
      user="$(ask "Linux user (boş bırak: oluşturma)" "")"
      create_static_site "$domain" "$root" "$with_www" "$with_ssl" "$email" "$user"
      ;;
    5)
      local port
      root="/var/www/${domain}"
      port="$(ask "Python app port (örn: 8000)" "8000")"
      user="$(ask "Linux user (boş bırak: oluşturma)" "")"
      create_python_site "$domain" "$root" "$port" "$with_www" "$with_ssl" "$email" "$user"
      ;;
    6)
      local upstream
      upstream="$(ask "Upstream (örn: http://127.0.0.1:8080 veya http://192.168.1.10:3000)")"
      [[ -n "$upstream" ]] || die "upstream boş olamaz"
      create_reverse_proxy "$domain" "$upstream" "$with_www" "$with_ssl" "$email"
      ;;
    *)
      die "Geçersiz seçim"
      ;;
  esac

  msg "Tamamlandı."
}

main "$@"
