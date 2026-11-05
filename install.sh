#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — Install
# doctor.sh'ı çalıştırır, panel/ uygulamasını hedef dizine
# kurar, veritabanını hazırlar, super admin oluşturur, Nginx
# vhost'unu (port 24428) ve systemd servisini kurup başlatır.
#
# Kullanım:
#   sudo bash install.sh                  (etkileşimli)
#   sudo bash install.sh --yes            (doctor.sh'a otomatik onay geçer)
#   sudo PANEL_PUBLIC_HOST=127.0.0.1 bash install.sh --yes
#                                         (panel vhost'u yalnız loopback'te;
#                                          değer .env'e yazılır — bkz. adım 7)
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
# Panelin ürettiği ve güncellemeden sağ çıkması gereken durumun (deploy
# anahtarları, yedekler, Docker ayarı) varsayılan kökü — PANEL_DIR DIŞINDA,
# çünkü PANEL_DIR her çalıştırmada panel/'in `rsync --delete` aynası olur
# (bkz. adım 2 ve 8).
PANEL_STATE_DIR="${PANEL_STATE_DIR:-/var/lib/rudder}"
ENV_FILE="${PANEL_DIR}/.env"
DB_CREDS_FILE="/root/.panel-db-credentials"
PANEL_CREDS_FILE="/root/.panel-credentials"

AUTO_YES=0
for arg in "$@"; do
  [[ "$arg" == "--yes" || "$arg" == "-y" ]] && AUTO_YES=1
done

[[ -d "${PANEL_SRC}" ]] || die "panel/ bulunamadı (${PANEL_SRC}). Bu scripti repo kökünden çalıştırdığından emin ol."

# ------------------------------------------------------------
# .env yardımcıları — systemd EnvironmentFile biçimi (KEY=değer). Aynı
# anahtar birden çok kez geçerse systemd gibi SONUNCUSU geçerlidir;
# değeri çevreleyen tek/çift tırnak atılır.
# ------------------------------------------------------------
env_has() { [[ -f "${ENV_FILE}" ]] && grep -qE "^$1=" "${ENV_FILE}"; }

env_get() {
  local line="" dq='^"(.*)"$' sq="^'(.*)'\$"
  [[ -f "${ENV_FILE}" ]] || return 0
  line="$(grep -E "^$1=" "${ENV_FILE}" | tail -n 1)" || true
  line="${line#*=}"
  if [[ "${line}" =~ ${dq} || "${line}" =~ ${sq} ]]; then
    line="${BASH_REMATCH[1]}"
  fi
  printf '%s' "${line}"
}

# Değer `|` içeremez (sed ayırıcısı) — çağıranlar yolu/adresi önceden doğrular.
env_set() {
  local key="$1" val="$2"
  if env_has "${key}"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}"
  else
    # Elle düzenlenmiş .env son satırında \n olmayabilir — önceki satıra yapışmasın.
    [[ -z "$(tail -c 1 "${ENV_FILE}")" ]] || echo >> "${ENV_FILE}"
    echo "${key}=${val}" >> "${ENV_FILE}"
  fi
}

# Kalıcı durum dizini olabilecek yol: mutlak, en az iki bileşenli, `.`/`..`
# bileşeni yok, PANEL_DIR'in kendisi ya da üst dizini değil.
STATE_PATH_RE='^/[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+$'
valid_state_path() {
  local p="$1"
  [[ "${p}" =~ ${STATE_PATH_RE} ]] || return 1
  [[ "${p}/" != *"/./"* && "${p}/" != *"/../"* ]] || return 1
  [[ "${PANEL_DIR}/" != "${p}/"* ]]
}

STATE_KEYS=(DEPLOY_KEYS_DIR BACKUP_DIR DOCKER_CONFIG)

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
info "1/9 — doctor.sh çalıştırılıyor (gereksinim kontrolü + kurulumu)..."
DOCTOR_ARGS=()
[[ "${AUTO_YES}" -eq 1 ]] && DOCTOR_ARGS+=(--yes)
PANEL_DIR="${PANEL_DIR}" PANEL_USER="${PANEL_USER}" bash "${REPO_DIR}/doctor.sh" "${DOCTOR_ARGS[@]}"

# .env'de elle verilmiş kalıcı durum yollarını hiçbir şeye dokunmadan önce
# doğrula — geçersiz bir yol build'den sonra değil, burada durdursun.
for key in "${STATE_KEYS[@]}"; do
  dir="$(env_get "${key}")"
  [[ -z "${dir}" ]] || valid_state_path "${dir}" \
    || die "${ENV_FILE}: ${key}='${dir}' geçersiz (mutlak, en az iki bileşenli bir yol olmalı; PANEL_DIR'in kendisi ya da üstü olamaz). Düzeltip tekrar çalıştır."
done

# Panel vhost'unun dinleme adresi (adım 7) de burada çözülür ve doğrulanır.
#
# Dinleme adresi .env'deki PANEL_PUBLIC_HOST'tan gelir:
#   yok / boş / 0.0.0.0 / *  tüm arayüzler: `listen PORT` + `[::]:PORT`
#                            (eski davranış, varsayılan)
#   127.0.0.1 / localhost    yalnız loopback: 127.0.0.1 + (varsa) [::1] —
#                            panele SSH tüneliyle ya da önündeki bir
#                            proxy'yle erişilir
#   <IPv4> / <IPv6>          yalnız o adres
# Öncelik: install.sh'ı çalıştırırken ortamdan verilen değer (.env'e
# yazılır) > .env > mevcut panel.conf. Sonuncusu, vhost'u elle belirli bir
# adrese çekmiş kurulumlar içindir: .env'de ayar yoksa o adres benimsenip
# .env'e yazılır — güncelleme paneli sessizce tüm arayüzlere açmasın.
NGINX_CONF="/etc/nginx/sites-available/panel.conf"

# Mevcut panel.conf joker değil de belirli bir adreste dinliyorsa o adres.
vhost_listen_host() {
  local addr first=""
  [[ -f "${NGINX_CONF}" ]] || return 0
  while read -r addr; do
    addr="${addr%;}"
    case "${addr}" in
      "${PUBLIC_PORT}"|"[::]:${PUBLIC_PORT}"|"0.0.0.0:${PUBLIC_PORT}"|"*:${PUBLIC_PORT}") return 0 ;;
    esac
    [[ -n "${first}" ]] || first="${addr}"
  done < <(awk '$1 == "listen" { print $2 }' "${NGINX_CONF}")
  case "${first}" in
    "127.0.0.1:${PUBLIC_PORT}"|"[::1]:${PUBLIC_PORT}"|"localhost:${PUBLIC_PORT}") echo "127.0.0.1" ;;
    *":${PUBLIC_PORT}") echo "${first%":${PUBLIC_PORT}"}" ;;
  esac
}

has_ipv6_loopback() { grep -qi '^0\{31\}1 ' /proc/net/if_inet6 2>/dev/null; }

if [[ -n "${PANEL_PUBLIC_HOST+x}" ]]; then
  PUBLIC_HOST="${PANEL_PUBLIC_HOST}"; PUBLIC_HOST_FROM="ortam"
elif env_has PANEL_PUBLIC_HOST; then
  PUBLIC_HOST="$(env_get PANEL_PUBLIC_HOST)"; PUBLIC_HOST_FROM=".env"
else
  PUBLIC_HOST="$(vhost_listen_host)"; PUBLIC_HOST_FROM="panel.conf"
fi

IPV4_RE='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
IPV6_RE='^[0-9A-Fa-f.]*:[0-9A-Fa-f:.]*$'
LISTEN_ADDRS=()
case "${PUBLIC_HOST}" in
  ""|"*"|"0.0.0.0")
    LISTEN_ADDRS=("${PUBLIC_PORT}" "[::]:${PUBLIC_PORT}") ;;
  localhost|127.0.0.1)
    LISTEN_ADDRS=("127.0.0.1:${PUBLIC_PORT}")
    # IPv6'sı kapalı bir sunucuda [::1]'e bind edilemez; nginx hiç kalkmaz.
    if has_ipv6_loopback; then LISTEN_ADDRS+=("[::1]:${PUBLIC_PORT}"); fi ;;
  *)
    host="${PUBLIC_HOST#\[}"; host="${host%\]}"
    if [[ "${host}" =~ ${IPV4_RE} ]]; then
      LISTEN_ADDRS=("${host}:${PUBLIC_PORT}")
    elif [[ "${host}" =~ ${IPV6_RE} ]]; then
      LISTEN_ADDRS=("[${host}]:${PUBLIC_PORT}")
    else
      die "PANEL_PUBLIC_HOST geçersiz: '${PUBLIC_HOST}' (${PUBLIC_HOST_FROM}) — boş, 127.0.0.1, localhost ya da bir IPv4/IPv6 adresi olmalı."
    fi ;;
esac

# ------------------------------------------------------------
# 2) Panel kodunu hedef dizine yerleştir
#
# PANEL_DIR aynı zamanda `panel` kullanıcısının ev dizini (doctor.sh) ve
# `--delete` kaynakta olmayan her şeyi siler: v1.6.0-rc.1'e kadar her
# güncelleme ~/.ssh'taki site deploy anahtarlarını (git pull'lar kırılır),
# backups/'ı (yerel yedekler + deploy öncesi dökümler) ve ~/.docker'ı
# (buildx seçimi) siliyordu. Kalıcı durum artık PANEL_DIR dışında (adım 8);
# buna ek olarak burada silinmekten KORUNANLAR (`P`: kaynaktan gelen aynı
# adlı dosya yine kopyalanır, yalnız silme engellenir):
#  - kök düzeydeki gizli girdiler: ev dizininin durumu (~/.ssh/known_hosts,
#    ~/.npm, ~/.cache, ~/.config/gh, eski ~/.docker...) ve .env,
#  - eski backups/ (adım 8 taşıyana kadar),
#  - .env'deki durum dizinlerinden PANEL_DIR içinde kalan varsa o.
# ------------------------------------------------------------
hr
info "2/9 — panel/ kodu ${PANEL_DIR} içine kopyalanıyor..."
RSYNC_PROTECT=(--filter='P /.*' --filter='P /backups/')
for key in "${STATE_KEYS[@]}"; do
  dir="$(env_get "${key}")"
  if [[ -n "${dir}" && "${dir}/" == "${PANEL_DIR}/"* ]]; then
    RSYNC_PROTECT+=(--filter="P /${dir#"${PANEL_DIR}/"}/")
    warn "${key}=${dir} PANEL_DIR içinde — silinmekten korunuyor ama PANEL_DIR dışına taşıman önerilir."
  fi
done
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .env --exclude .env.local \
  "${RSYNC_PROTECT[@]}" \
  "${PANEL_SRC}/" "${PANEL_DIR}/"
chown -R "${PANEL_USER}:${PANEL_USER}" "${PANEL_DIR}"
msg "Kod kopyalandı: ${PANEL_DIR}"

# ------------------------------------------------------------
# 3) .env dosyası (npm install/build'dan ÖNCE — Prisma 7'nin
#    prisma.config.ts'i artık `prisma generate` sırasında bile DATABASE_URL'i
#    eagerly çözmeye çalışıyor, .env henüz yoksa postinstall (prisma generate)
#    "Cannot resolve environment variable: DATABASE_URL" ile patlıyordu.
# ------------------------------------------------------------
hr
info "3/9 — .env oluşturuluyor..."
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

# Panel içi güncelleme (panel/scripts/self-update.sh) git işlemlerini bu
# KAYNAK KLONDA yapmak zorunda — PANEL_DIR bir rsync kopyasıdır, .git
# içermez. Klonun yeri .env'e yazılır (systemd EnvironmentFile ile panel
# sürecine geçer). Her çalıştırmada tazelenir: install.sh başka bir klondan
# çalıştırılırsa panel de artık orayı kullanır.
env_set PANEL_SRC_DIR "${REPO_DIR}"
msg "Kaynak klon yeri .env'e yazıldı: PANEL_SRC_DIR=${REPO_DIR}"

# ------------------------------------------------------------
# 4) Bağımlılıklar + build
# ------------------------------------------------------------
hr
info "4/9 — bağımlılıklar kuruluyor ve build alınıyor (biraz sürebilir)..."
sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && npm install"
sudo -u "${PANEL_USER}" bash -c "cd '${PANEL_DIR}' && npm run build"
msg "Build tamamlandı."

# ------------------------------------------------------------
# 5) DB migration (Prisma şeması eklenince aktif olacak)
# ------------------------------------------------------------
hr
info "5/9 — veritabanı migration..."
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
info "6/9 — super admin kullanıcısı..."
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
# 7) Nginx vhost (port 24428) — dinleme adresi (PANEL_PUBLIC_HOST) adım
#    1'in ardından çözüldü ve doğrulandı; .env'e burada yazılır.
# ------------------------------------------------------------
hr
info "7/9 — Nginx vhost yazılıyor (port ${PUBLIC_PORT})..."
# Joker benimsenmez (.env'e yazılmaz): ayar yokken sonradan elle değiştirilen
# bir panel.conf bir sonraki güncellemede yine benimsenebilsin.
if [[ "${PUBLIC_HOST_FROM}" == "ortam" || ( "${PUBLIC_HOST_FROM}" == "panel.conf" && -n "${PUBLIC_HOST}" ) ]]; then
  env_set PANEL_PUBLIC_HOST "${PUBLIC_HOST}"
  msg "PANEL_PUBLIC_HOST=${PUBLIC_HOST} .env'e yazıldı (kaynak: ${PUBLIC_HOST_FROM})."
fi
LISTEN_BLOCK="$(printf '  listen %s;\n' "${LISTEN_ADDRS[@]}")"

# nginx'in panel portunda tam olarak beklenen adreslerde dinleyip dinlemediği.
panel_listen_ok() {
  local want have
  want="$(for a in "${LISTEN_ADDRS[@]}"; do
            [[ "${a}" == "${PUBLIC_PORT}" ]] && echo "0.0.0.0:${PUBLIC_PORT}" || echo "${a}"
          done | sort)"
  have="$(ss -Htln "sport = :${PUBLIC_PORT}" | awk '{ print $4 }' | sed 's/^\*:/[::]:/' | sort -u)"
  [[ "${want}" == "${have}" ]]
}

OLD_LISTEN=""
[[ -f "${NGINX_CONF}" ]] && OLD_LISTEN="$(awk '$1 == "listen"' "${NGINX_CONF}" | sed -E 's/^[[:space:]]+//')"
cat > "${NGINX_CONF}" <<EOF
server {
${LISTEN_BLOCK}
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

    # Nginx varsayilani (60s) web terminalinin (bkz. server.mjs) websocket
    # tunelini bosta sanip erken kapatirdi; server.mjs zaten 20sn'de bir
    # ping/pong heartbeat'i akitiyor ama bu deger yine de ek bir guvence
    # olarak comert tutuluyor.
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
EOF
ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/panel.conf"
nginx -t
NEW_LISTEN="$(awk '$1 == "listen"' "${NGINX_CONF}" | sed -E 's/^[[:space:]]+//')"
# Aynı portta joker ↔ belirli adres geçişinde `reload` yeni soketi bağlayamaz
# (EADDRINUSE); nginx error.log'a "still could not bind()" yazıp ESKİ soketle
# devam eder, `systemctl reload` yine başarılı döner. Dinleme satırları
# değiştiyse doğrudan restart (sitelerde ~1 sn kesinti); her durumda sonuç
# `ss` ile doğrulanır.
if [[ -n "${OLD_LISTEN}" && "${OLD_LISTEN}" != "${NEW_LISTEN}" ]]; then
  info "Panel vhost'unun dinleme adresi değişti — nginx yeniden başlatılıyor (reload bu geçişi uygulayamıyor)."
  systemctl restart nginx
else
  systemctl reload-or-restart nginx
fi
if command -v ss >/dev/null 2>&1; then
  # reload eşzamansız; nginx bind'i ~2,5 sn boyunca yeniden dener.
  for _ in 1 2 3 4 5 6 7 8 9 10; do panel_listen_ok && break; sleep 0.5; done
  if ! panel_listen_ok; then
    warn "nginx panel portunda beklenen adreslerde dinlemiyor (eski soket kalmış olabilir) — yeniden başlatılıyor."
    systemctl restart nginx
    panel_listen_ok || warn "nginx hâlâ beklenen adreslerde dinlemiyor: beklenen '${LISTEN_ADDRS[*]}', 'ss -tlnp' ve /var/log/nginx/error.log'u kontrol et."
  fi
else
  warn "ss bulunamadı — panel portunun dinleme adresi doğrulanamadı."
fi
msg "Nginx vhost aktif: ${LISTEN_ADDRS[*]} -> 127.0.0.1:${PANEL_PORT}"

# Cloudflare proxy'si arkasındaki siteler için gerçek ziyaretçi IP'si (real_ip)
# — best-effort; ağ yoksa uyarır, kurulumu durdurmaz. Ayarlar'dan tekrar
# çalıştırılabilir.
if bash "${PANEL_DIR}/scripts/provision-site.sh" refresh-cloudflare-ips >/dev/null 2>&1; then
  msg "Cloudflare IP aralıkları (nginx real_ip) güncellendi."
else
  warn "Cloudflare IP aralıkları alınamadı (ağ?) — Ayarlar → Panel Alan Adı → 'Cloudflare IP'lerini Yenile' ile sonra deneyebilirsin."
fi

# ------------------------------------------------------------
# 8) Kalıcı durum — PANEL_DIR dışında
#
# Panelin ürettiği ve güncellemeden sağ çıkması gereken her şey .env'de adı
# geçen bir dizinde durur (panel süreci bunları EnvironmentFile ile alır):
#   DEPLOY_KEYS_DIR  site deploy anahtarları (src/lib/deploy-keys.ts)
#   BACKUP_DIR       yerel yedekler + deploy öncesi dökümler (src/lib/backup.ts)
#   DOCKER_CONFIG    panel kullanıcısının Docker/buildx ayarı (deploy komutları
#                    ve compose işlemleri process.env'i devralır)
# .env'de yoksa ${PANEL_STATE_DIR}/{ssh,backups,docker} kullanılır ve .env'e
# yazılır; elle verilmiş bir değer (ör. BACKUP_DIR=/var/backups/rudder)
# olduğu gibi kalır, yalnız sahipliği/izni düzeltilir. Eski kurulumların
# PANEL_DIR içindeki kopyaları (~/.ssh/site_*_deploy, backups/, ~/.docker)
# buraya TAŞINIR, aynı adlı bir şeyin üzerine yazılmaz. Adım servisin
# yeniden başlatılmasından hemen önce: eski süreç eski yolları ancak birkaç
# saniye görür.
# ------------------------------------------------------------
hr
info "8/9 — kalıcı durum (deploy anahtarları, yedekler, Docker ayarı) PANEL_DIR dışına alınıyor..."

# Dizin panel kullanıcısına ait ve yalnız onun girebileceği (0700) olsun.
ensure_private_dir() {
  mkdir -p "$1"
  chown "${PANEL_USER}:${PANEL_USER}" "$1"
  chmod 0700 "$1"
}

# <kaynak> içindekileri <hedef>e taşır. Hedefte aynı adla bir dizin varsa
# içine iner; aynı adla bir dosya varsa ikisini de yerinde bırakır.
merge_move() {
  local src="$1" dst="$2" entry name
  for entry in "${src}"/* "${src}"/.[!.]* "${src}"/..?*; do
    [[ -e "${entry}" || -L "${entry}" ]] || continue
    name="${entry##*/}"
    if [[ ! -e "${dst}/${name}" && ! -L "${dst}/${name}" ]]; then
      mv -- "${entry}" "${dst}/${name}"
    elif [[ -d "${entry}" && ! -L "${entry}" && -d "${dst}/${name}" && ! -L "${dst}/${name}" ]]; then
      merge_move "${entry}" "${dst}/${name}"
      rmdir -- "${entry}" 2>/dev/null || true
    else
      warn "Hedefte aynı adla zaten var, taşınmadı (ikisi de duruyor): ${entry}"
    fi
  done
}

# Eski konumu boşaldıysa kaldırır; boşalmadıysa başkaları okuyamasın.
retire_legacy_dir() {
  rmdir -- "$1" 2>/dev/null && return 0
  chmod -R go-rwx "$1" || true
  warn "$1 tamamen taşınamadı (yukarıdaki uyarılar) — erişimi kısıtlandı, elle kontrol et."
}

state_dir() {  # state_dir <ANAHTAR> <alt-dizin>: .env'deki değer ya da varsayılan
  local val
  val="$(env_get "$1")"
  printf '%s' "${val:-${PANEL_STATE_DIR}/$2}"
}

# PANEL_STATE_DIR'in kendisi root'a ait kalır (panel yalnız alt dizinlerine yazar).
valid_state_path "${PANEL_STATE_DIR}/x" || die "PANEL_STATE_DIR geçersiz: '${PANEL_STATE_DIR}'"
install -d -o root -g root -m 0755 "${PANEL_STATE_DIR}"

# --- Deploy anahtarları ----------------------------------------
# Yalnız panelin ürettiği site_*_deploy çiftleri taşınır; known_hosts vb.
# ~/.ssh'ta kalır (adım 2 korur). DEPLOY_KEYS_DIR elle verilmiş olsa da eski
# anahtarlar oraya alınır — panel artık yalnız orada arar.
KEYS_DIR="$(state_dir DEPLOY_KEYS_DIR ssh)"
ensure_private_dir "${KEYS_DIR}"
moved=0
for key_file in "${PANEL_DIR}/.ssh"/site_*_deploy "${PANEL_DIR}/.ssh"/site_*_deploy.pub; do
  [[ -f "${key_file}" && "${KEYS_DIR}" != "${PANEL_DIR}/.ssh" ]] || continue
  if [[ -e "${KEYS_DIR}/${key_file##*/}" ]]; then
    warn "Hedefte aynı adla zaten var, taşınmadı (ikisi de duruyor): ${key_file}"
    continue
  fi
  mv -- "${key_file}" "${KEYS_DIR}/"
  moved=$((moved + 1))
done
[[ "${moved}" -eq 0 ]] || msg "${moved} deploy anahtarı dosyası taşındı: ${PANEL_DIR}/.ssh → ${KEYS_DIR}"
env_set DEPLOY_KEYS_DIR "${KEYS_DIR}"

# --- Yedekler --------------------------------------------------
BACKUP_DIR_PATH="$(state_dir BACKUP_DIR backups)"
ensure_private_dir "${BACKUP_DIR_PATH}"
LEGACY_BACKUPS="${PANEL_DIR}/backups"
if [[ -d "${LEGACY_BACKUPS}" && ! -L "${LEGACY_BACKUPS}" && "${BACKUP_DIR_PATH}" != "${LEGACY_BACKUPS}" ]]; then
  if [[ -n "$(ls -A "${LEGACY_BACKUPS}")" ]]; then
    merge_move "${LEGACY_BACKUPS}" "${BACKUP_DIR_PATH}"
    msg "Eski yedekler taşındı: ${LEGACY_BACKUPS} → ${BACKUP_DIR_PATH}"
  fi
  retire_legacy_dir "${LEGACY_BACKUPS}"
fi
env_set BACKUP_DIR "${BACKUP_DIR_PATH}"
# Dökümler veritabanının tamamı: yalnız panel kullanıcısı okuyabilmeli. Eski
# sürümler (servis UMask=0002) dizinleri 775, dosyaları 664 bırakıyordu.
chmod -R go-rwx "${BACKUP_DIR_PATH}" || warn "${BACKUP_DIR_PATH} izinleri daraltılamadı."

# --- Docker ayarı ----------------------------------------------
# Eski ~/.docker yalnız DOCKER_CONFIG'i biz ayarlıyorsak taşınır; elle
# verilmiş bir DOCKER_CONFIG'in içine başka bir ayar karıştırılmaz.
DOCKER_CONFIG_PATH="$(env_get DOCKER_CONFIG)"
if [[ -n "${DOCKER_CONFIG_PATH}" ]]; then
  ensure_private_dir "${DOCKER_CONFIG_PATH}"
else
  DOCKER_CONFIG_PATH="${PANEL_STATE_DIR}/docker"
  ensure_private_dir "${DOCKER_CONFIG_PATH}"
  if [[ -d "${PANEL_DIR}/.docker" && ! -L "${PANEL_DIR}/.docker" ]]; then
    if [[ -n "$(ls -A "${PANEL_DIR}/.docker")" ]]; then
      merge_move "${PANEL_DIR}/.docker" "${DOCKER_CONFIG_PATH}"
      chown -R "${PANEL_USER}:${PANEL_USER}" "${DOCKER_CONFIG_PATH}"
      msg "Docker ayarı taşındı: ${PANEL_DIR}/.docker → ${DOCKER_CONFIG_PATH}"
    fi
    retire_legacy_dir "${PANEL_DIR}/.docker"
  fi
  env_set DOCKER_CONFIG "${DOCKER_CONFIG_PATH}"
fi
msg "Kalıcı durum: DEPLOY_KEYS_DIR=${KEYS_DIR} · BACKUP_DIR=${BACKUP_DIR_PATH} · DOCKER_CONFIG=${DOCKER_CONFIG_PATH}"

# ------------------------------------------------------------
# 9) systemd servisi
# ------------------------------------------------------------
hr
info "9/9 — systemd servisi kuruluyor..."
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
# Panelin oluşturduğu dosyalar (dosya yöneticisi, git clone) grup-yazılabilir
# olsun: site klasörleri setgid ile sitenin kendi grubunu taşır, dedicated
# kullanıcı (üye terminali) bu dosyaları düzenleyebilsin.
UMask=0002

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable panel
# KASITLI: `enable --now` DEĞİL. `--now` servis zaten çalışıyorsa hiçbir şey
# yapmaz (yeniden başlatmaz) — bu yüzden install.sh'ı bir güncelleme almak
# için tekrar çalıştırmak, yeni build diskte olsa bile ESKİ süreç canlı
# kaldığı için hiçbir etki yaratmıyordu (gerçek bir olayda böyle bulundu:
# git pull + build defalarca doğru şekilde yenilendi ama panel.service hiç
# yeniden başlamadığı için değişiklikler asla devreye girmedi). `restart`
# hem ilk kurulumda (servis henüz yoksa/durmuşsa normal başlatma gibi
# davranır) hem de tekrar çalıştırmada (var olan süreci öldürüp yeni build'i
# devreye sokar) doğru sonucu verir.
systemctl restart panel
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
case "${LISTEN_ADDRS[0]}" in
  "${PUBLIC_PORT}")
    echo "🌐 Panel: http://${SERVER_IP:-<sunucu-ip>}:${PUBLIC_PORT}" ;;
  "127.0.0.1:${PUBLIC_PORT}"|"[::1]:${PUBLIC_PORT}")
    echo "🌐 Panel yalnız bu sunucudan erişilebilir (PANEL_PUBLIC_HOST=${PUBLIC_HOST}). SSH tüneliyle:"
    echo "   ssh -N -L ${PUBLIC_PORT}:127.0.0.1:${PUBLIC_PORT} <kullanıcı>@${SERVER_IP:-<sunucu-ip>}  →  http://127.0.0.1:${PUBLIC_PORT}" ;;
  *)
    echo "🌐 Panel: http://${LISTEN_ADDRS[0]}" ;;
esac
if [[ -f "${PANEL_CREDS_FILE}" ]]; then
  echo "🔑 Super admin bilgileri: ${PANEL_CREDS_FILE}"
else
  echo "⚠  Super admin henüz oluşturulamadı (backend/seed script eksik) — eklenince bu scripti tekrar çalıştır."
fi
echo
