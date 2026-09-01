#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — Install
# doctor.sh'ı çalıştırır, panel/ uygulamasını hedef dizine
# kurar, veritabanını hazırlar, super admin oluşturur, Nginx
# vhost'unu (port 24428) ve systemd servisini kurup başlatır.
#
# Kullanım:
#   sudo bash install.sh          (etkileşimli)
#   sudo bash install.sh --yes    (doctor.sh'a otomatik onay geçer)
#
# Bu script, klonlanmış repo'nun İÇİNDEN (panel/ ile aynı dizinden)
# çalıştırılmalı: sunucuda `git clone ... && cd <repo> && sudo bash install.sh`
# ============================================================

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'

msg()  { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}" >&2; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }
hr()   { echo -e "${GRAY}------------------------------------------------------------${NC}"; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PANEL_SRC="${REPO_DIR}/panel"
PANEL_DIR="${PANEL_DIR:-/opt/sunucu-paneli}"
PANEL_USER="${PANEL_USER:-panel}"
PANEL_PORT="${PANEL_PORT:-3000}"      # Next.js'in dinlediği iç port
PUBLIC_PORT="${PUBLIC_PORT:-24428}"   # Nginx'in dışarı açtığı port
DB_CREDS_FILE="/root/.panel-db-credentials"
PANEL_CREDS_FILE="/root/.panel-credentials"

AUTO_YES=0
for arg in "$@"; do
  [[ "$arg" == "--yes" || "$arg" == "-y" ]] && AUTO_YES=1
done

[[ -d "${PANEL_SRC}" ]] || die "panel/ bulunamadı (${PANEL_SRC}). Bu scripti repo kökünden çalıştırdığından emin ol."

# ------------------------------------------------------------
# 0) Root kontrolü
# ------------------------------------------------------------
if [[ ${EUID} -ne 0 ]]; then
  echo
  warn "Bu script paket/servis/veritabanı kurulumu için root yetkisi gerektiriyor."
  read -r -p "sudo ile devam edilsin mi? [e/H]: " ANS
  [[ "${ANS}" =~ ^[Ee]$ ]] || die "Root yetkisi olmadan devam edilemiyor."
  exec sudo -E bash "$0" "$@"
fi

echo
info "=============================================="
info "  Sunucu Yönetim Paneli — Install"
info "=============================================="
echo

# ------------------------------------------------------------
# 1) doctor.sh
# ------------------------------------------------------------
hr
info "1/8 — doctor.sh çalıştırılıyor (gereksinim kontrolü + kurulumu)..."
DOCTOR_ARGS=()
[[ "${AUTO_YES}" -eq 1 ]] && DOCTOR_ARGS+=(--yes)
PANEL_DIR="${PANEL_DIR}" PANEL_USER="${PANEL_USER}" bash "${REPO_DIR}/doctor.sh" "${DOCTOR_ARGS[@]}"

# ------------------------------------------------------------
# 2) Panel kodunu hedef dizine yerleştir
# ------------------------------------------------------------
hr
info "2/8 — panel/ kodu ${PANEL_DIR} içine kopyalanıyor..."
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .env --exclude .env.local \
  "${PANEL_SRC}/" "${PANEL_DIR}/"
chown -R "${PANEL_USER}:${PANEL_USER}" "${PANEL_DIR}"
msg "Kod kopyalandı: ${PANEL_DIR}"

# ------------------------------------------------------------
# 3) Bağımlılıklar + build
# ------------------------------------------------------------
hr
info "3/8 — bağımlılıklar kuruluyor ve build alınıyor (biraz sürebilir)..."
sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && npm install"
sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && npm run build"
msg "Build tamamlandı."

# ------------------------------------------------------------
# 4) .env dosyası
# ------------------------------------------------------------
hr
info "4/8 — .env oluşturuluyor..."
DATABASE_URL=""
if [[ -f "${DB_CREDS_FILE}" ]]; then
  # shellcheck disable=SC1090
  . "${DB_CREDS_FILE}"
  DATABASE_URL="${DATABASE_URL:-}"
fi
[[ -n "${DATABASE_URL}" ]] || warn "DATABASE_URL bulunamadı (${DB_CREDS_FILE} eksik) — .env'e boş yazılıyor, elle doldurman gerekecek."

if [[ -f "${PANEL_DIR}/.env" ]]; then
  msg ".env zaten var, üzerine yazılmıyor."
  # Asama D (S3 ayarlari) icin gereken anahtar onceki bir kurulumda yoksa
  # sonradan idempotent olarak ekleniyor - .env'in geri kalani dokunulmuyor.
  if ! grep -q '^SETTINGS_ENCRYPTION_KEY=' "${PANEL_DIR}/.env"; then
    echo "SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> "${PANEL_DIR}/.env"
    msg "SETTINGS_ENCRYPTION_KEY eklendi (S3 ayarlari icin gerekli, mevcut .env'e sonradan eklendi)."
  fi
else
  AUTH_SECRET="$(openssl rand -base64 32)"
  SETTINGS_ENCRYPTION_KEY="$(openssl rand -base64 32)"
  cat > "${PANEL_DIR}/.env" <<EOF
NODE_ENV=production
PORT=${PANEL_PORT}
DATABASE_URL=${DATABASE_URL}
AUTH_SECRET=${AUTH_SECRET}
SETTINGS_ENCRYPTION_KEY=${SETTINGS_ENCRYPTION_KEY}
EOF
  chown "${PANEL_USER}:${PANEL_USER}" "${PANEL_DIR}/.env"
  chmod 600 "${PANEL_DIR}/.env"
  msg ".env oluşturuldu."
fi

# ------------------------------------------------------------
# 5) DB migration (Prisma şeması eklenince aktif olacak)
# ------------------------------------------------------------
hr
info "5/8 — veritabanı migration..."
if sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && node -e \"process.exit(require('./package.json').scripts?.['db:migrate']?0:1)\""; then
  sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && npm run db:migrate"
  msg "Migration tamamlandı."
else
  warn "package.json içinde 'db:migrate' script'i yok — backend/Prisma şeması henüz eklenmedi, bu adım atlanıyor."
  warn "Şema eklenince: sudo bash install.sh tekrar çalıştırılabilir (idempotent)."
fi

# ------------------------------------------------------------
# 6) Super admin oluşturma (seed script eklenince aktif olacak)
# ------------------------------------------------------------
hr
info "6/8 — super admin kullanıcısı..."
if [[ -f "${PANEL_CREDS_FILE}" ]]; then
  msg "Super admin zaten oluşturulmuş: ${PANEL_CREDS_FILE}"
elif sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && node -e \"process.exit(require('./package.json').scripts?.['create-admin']?0:1)\""; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-20)"
  sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && ADMIN_USERNAME=admin ADMIN_PASSWORD='${ADMIN_PASSWORD}' npm run create-admin"
  cat > "${PANEL_CREDS_FILE}" <<EOF
# Sunucu Yönetim Paneli — super admin (install.sh tarafından oluşturuldu)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  chmod 600 "${PANEL_CREDS_FILE}"
  msg "Super admin oluşturuldu, kimlik bilgileri: ${PANEL_CREDS_FILE}"
else
  warn "package.json içinde 'create-admin' script'i yok — backend henüz eklenmedi, bu adım atlanıyor."
  warn "Script eklenince: sudo bash install.sh tekrar çalıştırılabilir (idempotent)."
fi

# ------------------------------------------------------------
# 7) Nginx vhost (port 24428)
# ------------------------------------------------------------
hr
info "7/8 — Nginx vhost yazılıyor (port ${PUBLIC_PORT})..."
NGINX_CONF="/etc/nginx/sites-available/panel.conf"
cat > "${NGINX_CONF}" <<EOF
server {
  listen ${PUBLIC_PORT};
  listen [::]:${PUBLIC_PORT};
  server_name _;

  access_log /var/log/nginx/panel.access.log;
  error_log  /var/log/nginx/panel.error.log;

  # 20m degil 200m: dosya yoneticisinin (Asama C) yukleme/duzenleme ust siniriyla
  # eslesecek sekilde yukseltildi (bkz. panel/src/lib/site-fs.ts MAX_UPLOAD_BYTES).
  client_max_body_size 200m;

  location / {
    proxy_pass http://127.0.0.1:${PANEL_PORT};
    proxy_http_version 1.1;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
EOF
ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/panel.conf"
nginx -t
systemctl reload nginx
msg "Nginx vhost aktif: :${PUBLIC_PORT} -> 127.0.0.1:${PANEL_PORT}"

# ------------------------------------------------------------
# 8) systemd servisi
# ------------------------------------------------------------
hr
info "8/8 — systemd servisi kuruluyor..."
cat > /etc/systemd/system/panel.service <<EOF
[Unit]
Description=Sunucu Yonetim Paneli (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=${PANEL_USER}
WorkingDirectory=${PANEL_DIR}
EnvironmentFile=${PANEL_DIR}/.env
ExecStart=/usr/bin/env npm run start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now panel
sleep 1
if systemctl is-active --quiet panel; then
  msg "panel.service çalışıyor."
else
  warn "panel.service başlamadı — 'journalctl -u panel -n 50' ile logları kontrol et."
fi

# ------------------------------------------------------------
# Özet
# ------------------------------------------------------------
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
hr
msg "Kurulum tamamlandı."
echo
echo "🌐 Panel: http://${SERVER_IP:-<sunucu-ip>}:${PUBLIC_PORT}"
if [[ -f "${PANEL_CREDS_FILE}" ]]; then
  echo "🔑 Super admin bilgileri: ${PANEL_CREDS_FILE}"
else
  echo "⚠  Super admin henüz oluşturulamadı (backend/seed script eksik) — eklenince bu scripti tekrar çalıştır."
fi
echo
