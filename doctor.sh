#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — Doctor
# Gereksinimleri kontrol eder, eksikleri (onay alarak) kurar,
# panel için sistem kullanıcısını/dizinini, PostgreSQL
# rol+veritabanını ve provisioning betiği için sınırlı sudoers
# iznini hazırlar.
#
# Kullanım:
#   sudo bash doctor.sh          (root sorup onay ister)
#   sudo bash doctor.sh --yes    (kurulumları otomatik onaylar)
#
# Bu script apt tabanlı Ubuntu/Debian sunucular için yazıldı.
# ============================================================

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'

msg()  { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}" >&2; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }
hr()   { echo -e "${GRAY}------------------------------------------------------------${NC}"; }

PANEL_DIR="${PANEL_DIR:-/opt/sunucu-paneli}"
PANEL_USER="${PANEL_USER:-panel}"
DB_NAME="${DB_NAME:-panel_db}"
DB_USER="${DB_USER:-panel}"
DB_CREDS_FILE="/root/.panel-db-credentials"

AUTO_YES=0
for arg in "$@"; do
  [[ "$arg" == "--yes" || "$arg" == "-y" ]] && AUTO_YES=1
done

# ------------------------------------------------------------
# 0) Root kontrolü — gerekiyorsa önce sorup sudo ile yeniden başlat
# ------------------------------------------------------------
if [[ ${EUID} -ne 0 ]]; then
  echo
  warn "Bu script sistem paketleri kurmak, kullanıcı/servis/veritabanı oluşturmak için root yetkisi gerektiriyor."
  read -r -p "sudo ile devam edilsin mi? [e/H]: " ANS
  [[ "${ANS}" =~ ^[Ee]$ ]] || die "Root yetkisi olmadan devam edilemiyor."
  exec sudo -E bash "$0" "$@"
fi

echo
info "=============================================="
info "  Sunucu Yönetim Paneli — Doctor"
info "=============================================="
echo

# ------------------------------------------------------------
# 1) OS / distro tespiti
# ------------------------------------------------------------
[[ -f /etc/os-release ]] || die "İşletim sistemi tespit edilemedi (/etc/os-release yok)."
# shellcheck disable=SC1091
. /etc/os-release
OS_ID="${ID:-unknown}"

case "${OS_ID}" in
  ubuntu|debian)
    msg "İşletim sistemi: ${PRETTY_NAME:-$OS_ID} (destekleniyor)"
    ;;
  *)
    warn "İşletim sistemi: ${PRETTY_NAME:-$OS_ID} — bu script apt tabanlı Ubuntu/Debian için yazıldı, devam ediliyor ama sorun çıkabilir."
    ;;
esac

PKG_UPDATE_DONE=0
apt_update_once() {
  if [[ "${PKG_UPDATE_DONE}" -eq 0 ]]; then
    info "apt paket listesi güncelleniyor..."
    apt-get update -qq
    PKG_UPDATE_DONE=1
  fi
}

# ------------------------------------------------------------
# 2) Gereksinim kontrolü
# ------------------------------------------------------------
declare -a MISSING=()
declare -a MISSING_LABEL=()

check_cmd() {
  local cmd="$1" label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    msg "${label}: kurulu ($(command -v "$cmd"))"
  else
    warn "${label}: bulunamadı"
    MISSING+=("$cmd")
    MISSING_LABEL+=("$label")
  fi
}

hr
info "Temel araçlar kontrol ediliyor..."
check_cmd git "git"
check_cmd curl "curl"
check_cmd rsync "rsync"
check_cmd unzip "unzip"
check_cmd nginx "nginx"

hr
info "Node.js kontrol ediliyor..."
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  if [[ "${NODE_MAJOR}" -ge 20 ]]; then
    msg "Node.js: $(node -v) (kurulu, yeterli sürüm)"
    NODE_OK=1
  else
    warn "Node.js: $(node -v) bulundu ama çok eski (>=20 gerekli)"
  fi
else
  warn "Node.js: bulunamadı"
fi
[[ "${NODE_OK}" -eq 1 ]] || { MISSING+=("nodejs"); MISSING_LABEL+=("Node.js 20+"); }

hr
info "Derleme araçları kontrol ediliyor (node-pty için gerekli — sunucu terminali, Aşama F)..."
BUILD_TOOLS_OK=1
command -v make >/dev/null 2>&1 || BUILD_TOOLS_OK=0
command -v g++ >/dev/null 2>&1 || BUILD_TOOLS_OK=0
command -v python3 >/dev/null 2>&1 || BUILD_TOOLS_OK=0
if [[ "${BUILD_TOOLS_OK}" -eq 1 ]]; then
  msg "Derleme araçları (make/g++/python3): kurulu"
else
  warn "Derleme araçları (make/g++/python3) eksik — 'npm install' sırasında node-pty derlenemez"
  MISSING+=("build-essential")
  MISSING_LABEL+=("build-essential + python3 — sunucu terminali (node-pty) için gerekli")
fi

hr
info "PostgreSQL kontrol ediliyor..."
check_cmd psql "PostgreSQL (client)"
if systemctl list-unit-files 2>/dev/null | grep -q '^postgresql'; then
  msg "PostgreSQL servisi: kurulu"
else
  warn "PostgreSQL servisi (systemd birimi) bulunamadı"
  MISSING+=("postgresql")
  MISSING_LABEL+=("PostgreSQL (server)")
fi

hr
info "MySQL/MariaDB kontrol ediliyor (WordPress siteleri için gerekli)..."
if command -v mysql >/dev/null 2>&1; then
  msg "MySQL/MariaDB (client): kurulu ($(command -v mysql))"
else
  warn "MySQL/MariaDB (client): bulunamadı"
fi
if systemctl list-unit-files 2>/dev/null | grep -Eq '^(mysql|mariadb)\.service'; then
  msg "MySQL/MariaDB servisi: kurulu"
else
  warn "MySQL/MariaDB servisi (systemd birimi) bulunamadı"
  MISSING+=("mariadb")
  MISSING_LABEL+=("MySQL/MariaDB (server) — WordPress site tipi için")
fi

hr
info "PHP-FPM kontrol ediliyor (PHP ve WordPress site tipleri için gerekli)..."
PHP_VERSIONS_NEEDED=("8.3" "8.2")
PHP_MISSING_VERSIONS=()
for pv in "${PHP_VERSIONS_NEEDED[@]}"; do
  if systemctl list-unit-files 2>/dev/null | grep -q "^php${pv}-fpm\.service"; then
    msg "PHP ${pv}-FPM: kurulu"
  else
    warn "PHP ${pv}-FPM: bulunamadı"
    PHP_MISSING_VERSIONS+=("$pv")
  fi
done
if [[ "${#PHP_MISSING_VERSIONS[@]}" -gt 0 ]]; then
  MISSING+=("php-fpm")
  MISSING_LABEL+=("PHP-FPM (${PHP_MISSING_VERSIONS[*]}) — PHP/WordPress site tipleri için")
fi

hr
info "Certbot kontrol ediliyor..."
if command -v certbot >/dev/null 2>&1; then
  msg "certbot: kurulu ($(command -v certbot))"
else
  warn "certbot: bulunamadı"
  MISSING+=("certbot")
  MISSING_LABEL+=("certbot + python3-certbot-nginx")
fi

hr
info "systemd kontrol ediliyor..."
command -v systemctl >/dev/null 2>&1 || die "systemd bulunamadı — bu panel systemd gerektiriyor, kurulum devam edemiyor."
msg "systemd: kurulu"

# ------------------------------------------------------------
# 3) Eksikleri kur
# ------------------------------------------------------------
echo
if [[ "${#MISSING[@]}" -gt 0 ]]; then
  hr
  warn "Eksik bulunanlar:"
  for i in "${!MISSING[@]}"; do
    echo "  - ${MISSING_LABEL[$i]}"
  done
  echo

  if [[ "${AUTO_YES}" -eq 0 ]]; then
    read -r -p "Eksik paketler kurulsun mu? [e/H]: " ANS
    [[ "${ANS}" =~ ^[Ee]$ ]] || die "Kullanıcı kurulumu onaylamadı, çıkılıyor."
  fi

  for item in "${MISSING[@]}"; do
    case "$item" in
      git|curl|rsync|unzip|nginx)
        apt_update_once
        info "${item} kuruluyor..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y "$item"
        msg "${item} kuruldu."
        ;;
      nodejs)
        info "Node.js 20 LTS kuruluyor (NodeSource)..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        msg "Node.js kuruldu: $(node -v)"
        ;;
      build-essential)
        apt_update_once
        info "build-essential + python3 kuruluyor (node-pty derlemesi için)..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y build-essential python3
        msg "Derleme araçları kuruldu."
        ;;
      postgresql)
        apt_update_once
        info "PostgreSQL kuruluyor..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
        systemctl enable --now postgresql
        msg "PostgreSQL kuruldu ve başlatıldı."
        ;;
      mariadb)
        apt_update_once
        info "MariaDB (MySQL uyumlu) kuruluyor..."
        DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
        systemctl enable --now mariadb
        msg "MariaDB kuruldu ve başlatıldı."
        ;;
      php-fpm)
        info "PHP-FPM kuruluyor (${PHP_MISSING_VERSIONS[*]})..."
        apt_update_once
        # NOT (düzeltme): eskiden yalnızca php8.3-fpm'in varsayılan depoda olup
        # olmadığına bakılıyordu — Ubuntu 24.04'te 8.3 varsayılan depoda VAR ama
        # 8.2 YOK, bu yüzden PPA hiç eklenmiyor ve 8.2 kurulumu "paket bulunamadı"
        # ile başarısız olup (set -euo pipefail yüzünden) TÜM kurulumu
        # durduruyordu. Artık istenen HER sürüm ayrı ayrı kontrol ediliyor.
        NEEDS_PPA=0
        for pv in "${PHP_MISSING_VERSIONS[@]}"; do
          apt-cache show "php${pv}-fpm" >/dev/null 2>&1 || { NEEDS_PPA=1; break; }
        done
        if [[ "${NEEDS_PPA}" -eq 1 ]]; then
          info "İstenen PHP sürüm(ler)i varsayılan apt deposunda yok, ondrej/php PPA ekleniyor..."
          DEBIAN_FRONTEND=noninteractive apt-get install -y software-properties-common
          add-apt-repository -y ppa:ondrej/php
          PKG_UPDATE_DONE=0
          apt_update_once
        fi
        for pv in "${PHP_MISSING_VERSIONS[@]}"; do
          if ! apt-cache show "php${pv}-fpm" >/dev/null 2>&1; then
            warn "php${pv}-fpm apt deposunda (PPA eklendikten sonra bile) bulunamadı — atlanıyor, kurulum durdurulmuyor."
            continue
          fi
          info "php${pv}-fpm kuruluyor..."
          DEBIAN_FRONTEND=noninteractive apt-get install -y \
            "php${pv}-fpm" "php${pv}-mysql" "php${pv}-curl" "php${pv}-gd" \
            "php${pv}-mbstring" "php${pv}-xml" "php${pv}-zip"
          systemctl enable --now "php${pv}-fpm"
          msg "php${pv}-fpm kuruldu ve başlatıldı."
        done
        ;;
      certbot)
        info "certbot kuruluyor..."
        if DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx 2>/dev/null; then
          msg "certbot apt ile kuruldu."
        else
          warn "certbot apt ile bulunamadı, snap fallback deneniyor (bkz. docs/certbot-kurulum.md)..."
          command -v snap >/dev/null 2>&1 || { apt_update_once; DEBIAN_FRONTEND=noninteractive apt-get install -y snapd; }
          snap install core || true
          snap refresh core || true
          snap install --classic certbot
          ln -sf /snap/bin/certbot /usr/bin/certbot
          msg "certbot snap ile kuruldu."
        fi
        ;;
      *)
        warn "Bilinmeyen paket: $item (atlanıyor)"
        ;;
    esac
  done
else
  hr
  msg "Tüm gereksinimler zaten kurulu."
fi

# ------------------------------------------------------------
# 4) Panel sistem kullanıcısı ve dizini
# ------------------------------------------------------------
hr
info "Panel kullanıcısı ve dizini hazırlanıyor..."
if id "${PANEL_USER}" >/dev/null 2>&1; then
  msg "Kullanıcı zaten var: ${PANEL_USER}"
else
  useradd --system --create-home --home-dir "${PANEL_DIR}" --shell /usr/sbin/nologin "${PANEL_USER}"
  msg "Kullanıcı oluşturuldu: ${PANEL_USER}"
fi
mkdir -p "${PANEL_DIR}"
chown -R "${PANEL_USER}:${PANEL_USER}" "${PANEL_DIR}"
msg "Dizin hazır: ${PANEL_DIR}"

# ------------------------------------------------------------
# 5) PostgreSQL rol + veritabanı (panelin kendi verisi için)
# ------------------------------------------------------------
hr
info "Panel veritabanı hazırlanıyor..."
if ! command -v psql >/dev/null 2>&1; then
  warn "psql bulunamadı, veritabanı adımı atlanıyor (PostgreSQL kurulumu başarısız olmuş olabilir)."
else
  ROLE_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null || true)"
  if [[ "${ROLE_EXISTS}" == "1" ]]; then
    msg "Veritabanı rolü zaten var: ${DB_USER} (şifre değiştirilmiyor)"
    if [[ -f "${DB_CREDS_FILE}" ]]; then
      msg "Mevcut kimlik bilgileri: ${DB_CREDS_FILE}"
    else
      warn "Rol var ama ${DB_CREDS_FILE} bulunamadı — DATABASE_URL'i elle oluşturman gerekebilir."
    fi
  else
    DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)"
    sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';" >/dev/null
    sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
    msg "Veritabanı oluşturuldu: ${DB_NAME} (sahip: ${DB_USER})"

    cat > "${DB_CREDS_FILE}" <<EOF
# Sunucu Yönetim Paneli — otomatik oluşturulan veritabanı kimlik bilgileri (doctor.sh)
# install.sh bu dosyayı okuyup panel/.env içine DATABASE_URL olarak yazar.
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
EOF
    chmod 600 "${DB_CREDS_FILE}"
    msg "Kimlik bilgileri kaydedildi: ${DB_CREDS_FILE} (yalnızca root okuyabilir)"
  fi
fi

# ------------------------------------------------------------
# 6) Panel sudoers — provision-site.sh + web terminali için şifresiz sudo
#
# Güvenlik modeli: panel süreci root olarak ÇALIŞMIYOR (User=panel).
# nginx/systemd/certbot/mysql gibi kök yetkisi gerektiren TÜM otomatik
# provisioning işlemleri TEK bir betik üzerinden yapılır (SUDOERS_LINE).
#
# İKİNCİ satır (TERMINAL_SUDOERS_LINE) BİLİNÇLİ bir istisna: panelin web
# terminali (SADECE SUPER_ADMIN'e açık, bkz. server.mjs) artık gerçek bir
# ROOT kabuğu açıyor — bu, "tek betik dışında hiçbir şeye sudo yok" ilkesini
# gerçek anlamda genişletir (root bash içinde herhangi bir komut
# çalıştırılabilir). Bilinçli bir tercih: panel zaten bir sunucu yönetim
# paneli ve SUPER_ADMIN operatörün fiilen sunucunun tam kontrolüne ihtiyacı
# var (provision-site.sh'ın kapsamadığı işlemler için). Dosya `visudo -c` ile
# doğrulanmadan asla kurulmaz (bozuk bir sudoers dosyası tüm sunucuda
# sudo'yu kilitleyebilir).
# ------------------------------------------------------------
hr
info "Panel sudoers izinleri hazırlanıyor..."
PROVISION_SCRIPT="${PANEL_DIR}/scripts/provision-site.sh"
SUDOERS_FILE="/etc/sudoers.d/panel-provisioning"
SUDOERS_LINE="${PANEL_USER} ALL=(root) NOPASSWD: ${PROVISION_SCRIPT}"
TERMINAL_SUDOERS_LINE="${PANEL_USER} ALL=(root) NOPASSWD: /bin/bash, /bin/sh"

if [[ -f "${SUDOERS_FILE}" ]] \
  && grep -qF "${SUDOERS_LINE}" "${SUDOERS_FILE}" 2>/dev/null \
  && grep -qF "${TERMINAL_SUDOERS_LINE}" "${SUDOERS_FILE}" 2>/dev/null; then
  msg "Sudoers izinleri zaten mevcut: ${SUDOERS_FILE}"
else
  TMP_SUDOERS="$(mktemp)"
  cat > "${TMP_SUDOERS}" <<EOF
# Sunucu Yönetim Paneli — otomatik oluşturuldu (doctor.sh). Elle düzenlemeyin;
# değişiklikler doctor.sh'ın bir sonraki çalıştırmasında algılanmayabilir.
#
# 1) ${PANEL_USER} kullanıcısına aşağıdaki TEK betiği şifresiz (NOPASSWD)
#    çalıştırma izni verir — nginx/systemd/certbot/mysql gibi kök gerektiren
#    OTOMATİK provisioning işlemleri buradan geçer, betiğin kendi argüman
#    doğrulamasından geçmek zorundadır (bkz. panel/scripts/provision-site.sh).
${SUDOERS_LINE}
#
# 2) ${PANEL_USER} kullanıcısına web terminali (SADECE SUPER_ADMIN'e açık,
#    bkz. server.mjs) için şifresiz ROOT kabuk izni verir. Bu, betik #1'in
#    aksine SINIRSIZ bir yetki genişletmesidir — terminal aracılığıyla root
#    olarak HERHANGİ bir komut çalıştırılabilir. Bilinçli bir tasarım
#    kararı: panel SUPER_ADMIN'in kendisi zaten sunucunun tam sahibi/
#    yöneticisi, terminal ona provision-site.sh'ın kapsamadığı işler için
#    tam kontrol veriyor.
${TERMINAL_SUDOERS_LINE}
EOF
  if visudo -c -f "${TMP_SUDOERS}" >/dev/null 2>&1; then
    install -o root -g root -m 0440 "${TMP_SUDOERS}" "${SUDOERS_FILE}"
    rm -f "${TMP_SUDOERS}"
    msg "Sudoers izinleri kuruldu: ${SUDOERS_FILE} (${PANEL_USER} -> ${PROVISION_SCRIPT} + root terminal, şifresiz)"
  else
    rm -f "${TMP_SUDOERS}"
    die "sudoers dosyası doğrulanamadı (visudo -c başarısız) — güvenlik nedeniyle kurulum durduruldu, hiçbir şey değiştirilmedi."
  fi
fi

if [[ ! -f "${PROVISION_SCRIPT}" ]]; then
  warn "${PROVISION_SCRIPT} henüz mevcut değil (install.sh'ın panel/ kopyalama adımı henüz çalışmadı olabilir) — sudoers izni zaten yazıldı, dosya oraya kopyalanınca otomatik geçerli olacak."
fi

# ------------------------------------------------------------
# 7) Docker grubu (isteğe bağlı) — DOCKER_COMPOSE ile yönetilen projeler
#    için panel kullanıcısının `docker compose restart` çalıştırabilmesi
#    gerekir. Bu GERÇEK bir root-eşdeğeri yetki genişletmesidir (docker
#    grubu üyeliği fiilen root'a eşittir) — bu yüzden diğer kurulum
#    adımlarının aksine HER ZAMAN ayrıca ve açıkça sorulur, --yes ile
#    dahi otomatik onaylanmaz.
# ------------------------------------------------------------
hr
if command -v docker >/dev/null 2>&1; then
  if id -nG "${PANEL_USER}" 2>/dev/null | grep -qw docker; then
    msg "${PANEL_USER} kullanıcısı zaten docker grubunda."
  else
    warn "Docker kurulu ama ${PANEL_USER} kullanıcısı 'docker' grubunda değil."
    echo "  Not: 'docker' grubu üyeliği fiilen root yetkisiyle eşdeğerdir (docker soketi üzerinden"
    echo "  konteyner içinden host'a erişilebilir). Yalnızca DOCKER_COMPOSE ile yönetilen"
    echo "  projelerde 'proje restart' özelliğini kullanmak istiyorsan gereklidir."
    read -r -p "${PANEL_USER} kullanıcısı 'docker' grubuna eklensin mi? [e/H]: " ANS
    if [[ "${ANS}" =~ ^[Ee]$ ]]; then
      usermod -aG docker "${PANEL_USER}"
      msg "${PANEL_USER} 'docker' grubuna eklendi (etkili olması için panel.service yeniden başlatılmalı)."
    else
      warn "Atlandı — DOCKER_COMPOSE tipi restart bu sunucuda çalışmayacak (manuel/CUSTOM_SCRIPT ile yönetilebilir)."
    fi
  fi
else
  info "Docker bulunamadı — DOCKER_COMPOSE restart desteği atlanıyor (kurulum gerekmiyor, opsiyonel)."
fi

# ------------------------------------------------------------
# 8) PM2 tespiti (bilgilendirme amaçlı) — panel PM2'yi otomatik kurmaz;
#    "otomatik tespit et ya da elle seç" prensibi gereği hangi süreç
#    yöneticisinin kullanılacağına sunucu sahibi karar verir. Burada
#    yalnızca varlığı/yokluğu raporlanır.
# ------------------------------------------------------------
hr
if command -v pm2 >/dev/null 2>&1; then
  msg "PM2 bulundu ($(pm2 --version 2>/dev/null || echo '?')) — 'PM2' process manager seçeneği kullanılabilir."
else
  info "PM2 bulunamadı. Projelerin PM2 ile yönetilmesini istiyorsan sunucuya elle kurman gerekir"
  info "(örn. 'npm install -g pm2') — panel bunu otomatik kurmaz, yalnızca varlığını kullanır."
fi

# ------------------------------------------------------------
# 9) Veritabanı yedekleme araçları (bilgilendirme amaçlı) — dosya
#    yöneticisi/backup özelliği (Aşama D) hangi motor tespit edilirse onun
#    dump aracını arar; burada yalnızca hangilerinin hazır olduğu raporlanır,
#    zorla kurulum YAPILMAZ (postgresql-client/mariadb-client zaten yukarıdaki
#    adımlarla gelmiş olabilir; mongodb-database-tools ayrı bir pakettir ve
#    yalnızca Mongo kullanan siteler için gerekir).
# ------------------------------------------------------------
hr
info "Veritabanı yedekleme araçları kontrol ediliyor..."
if command -v pg_dump >/dev/null 2>&1; then
  msg "pg_dump bulundu — PostgreSQL siteleri için yedekleme kullanılabilir."
else
  info "pg_dump bulunamadı — PostgreSQL kullanan sitelerde yedekleme çalışmayacak (postgresql-client paketi gerekir)."
fi
if command -v mysqldump >/dev/null 2>&1; then
  msg "mysqldump bulundu — MySQL/MariaDB siteleri için yedekleme kullanılabilir."
else
  info "mysqldump bulunamadı — MySQL/MariaDB kullanan sitelerde yedekleme çalışmayacak (mariadb-client/mysql-client paketi gerekir)."
fi
if command -v mongodump >/dev/null 2>&1; then
  msg "mongodump bulundu — MongoDB siteleri için yedekleme kullanılabilir."
else
  info "mongodump bulunamadı. MongoDB kullanan sitelerde yedekleme istiyorsan elle kurman gerekir"
  info "(bkz. 'mongodb-database-tools' paketi) — panel bunu otomatik kurmaz."
fi

# ------------------------------------------------------------
# 10) gh CLI (bilgilendirme amaçlı) — GitHub Actions SSH key özelliği
#     (Aşama E) `gh` kuruluysa VE authenticate edilmişse Actions secret'ını
#     otomatik ekleyebilir; değilse panel private key'i elle kopyalanmak
#     üzere gösterir. Bu yüzden PM2/backup araçlarıyla aynı desen: yalnızca
#     bilgilendirme, zorla kurulum YAPILMAZ.
# ------------------------------------------------------------
hr
if command -v gh >/dev/null 2>&1; then
  msg "gh CLI bulundu ($(gh --version 2>/dev/null | head -n1 || echo '?'))."
  if gh auth status >/dev/null 2>&1; then
    msg "gh CLI oturum açmış — GitHub Actions secret'ları otomatik eklenebilir."
  else
    info "gh CLI kurulu ama oturum açmamış. Otomatik secret eklemeyi istiyorsan"
    info "'panel' kullanıcısı olarak 'gh auth login' çalıştırman gerekir — opsiyoneldir,"
    info "olmadan da panel private key'i elle kopyalanmak üzere gösterir."
  fi
else
  info "gh CLI bulunamadı. GitHub Actions secret'ları otomatik eklenemeyecek —"
  info "panel private key'i elle GitHub'a yapıştırman için gösterecek, bu yeterlidir."
fi

echo
hr
msg "Doctor tamamlandı."
echo "Sıradaki adım: sudo bash install.sh"
