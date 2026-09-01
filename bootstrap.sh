#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — Bootstrap
#
# Sunucuya kurulumu başlatan giriş noktası: kaynağı GitHub'dan
# (belirli bir sürüme sabitlenmiş olarak) indirir, sonra
# install.sh'a devreder. doctor.sh/install.sh'ın AKSİNE bu
# betik klonlanmış bir repo'nun İÇİNDEN değil, TEK BAŞINA
# (curl ile indirilip doğrudan) çalıştırılmak üzere tasarlandı
# — sunucuda henüz repo, hatta git bile olmayabilir.
#
# Kullanım (sunucuda, tek satır kurulum):
#   curl -sSL https://github.com/chtsngn/rudder-cloud/releases/latest/download/bootstrap.sh -o /usr/local/bin/sunucu-paneli-kur
#   HASH=$(curl -sSL https://github.com/chtsngn/rudder-cloud/releases/latest/download/bootstrap.sh.sha256 | awk '{print $1}')
#   echo "${HASH}  /usr/local/bin/sunucu-paneli-kur" | sha256sum -c && chmod +x /usr/local/bin/sunucu-paneli-kur
#   sudo /usr/local/bin/sunucu-paneli-kur
#
# Belirli bir sürümü zorlamak isterseniz:
#   sudo GIT_REF=v1.2.3 /usr/local/bin/sunucu-paneli-kur
#
# NOT — BOOTSTRAP_VERSION: aşağıda "dev" olarak duruyor; bu,
# betiğin bir GitHub Release'e damgalanmadan (repo'dan doğrudan)
# çalıştırıldığı anlamına gelir. Her `git push --tags` sonrası
# .github/workflows/release.yml bu değeri o sürümün etiketiyle
# DEĞİŞTİRİP yayınlıyor (bkz. o dosya) — elle düzenlemeyin.
# ============================================================

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'

msg()  { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}" >&2; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }
hr()   { echo -e "${GRAY}------------------------------------------------------------${NC}"; }

# --- BUNLARI KENDİ DEPONUZA GÖRE DÜZENLEYİN ---
GITHUB_OWNER="${GITHUB_OWNER:-chtsngn}"
GITHUB_REPO="${GITHUB_REPO:-rudder-cloud}"
# ------------------------------------------------

BOOTSTRAP_VERSION="dev"   # release.yml tarafından build sırasında damgalanır — elle değiştirme
GIT_REF="${GIT_REF:-${BOOTSTRAP_VERSION}}"
SRC_DIR="${SRC_DIR:-/opt/sunucu-paneli-src}"

# ------------------------------------------------------------
# 0) Root kontrolü — gerekiyorsa önce sorup sudo ile yeniden başlat
# ------------------------------------------------------------
if [[ ${EUID} -ne 0 ]]; then
  echo
  warn "Bu script kurulum için root yetkisi gerektiriyor."
  read -r -p "sudo ile devam edilsin mi? [e/H]: " ANS
  [[ "${ANS}" =~ ^[Ee]$ ]] || die "Root yetkisi olmadan devam edilemiyor."
  exec sudo -E bash "$0" "$@"
fi

echo
info "=============================================="
info "  Sunucu Yönetim Paneli — Bootstrap"
info "=============================================="
echo

# ------------------------------------------------------------
# 1) git kurulu mu? (doctor.sh henüz çalışmadı, git bile olmayabilir)
# ------------------------------------------------------------
if command -v git >/dev/null 2>&1; then
  msg "1/3 — git zaten kurulu."
else
  info "1/3 — git kurulu değil, kuruluyor..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y git
  else
    die "git bulunamadı ve otomatik kurulamadı (yalnızca apt tabanlı Ubuntu/Debian destekleniyor). Elle kurup tekrar deneyin."
  fi
  msg "git kuruldu."
fi

# ------------------------------------------------------------
# 2) Kaynağı klonla / güncelle
# ------------------------------------------------------------
REPO_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git"
info "2/3 — kaynak indiriliyor (${GIT_REF})..."
if [[ -d "${SRC_DIR}/.git" ]]; then
  git -C "${SRC_DIR}" remote set-url origin "${REPO_URL}"
  git -C "${SRC_DIR}" fetch --tags --force origin
else
  rm -rf "${SRC_DIR}"
  git clone "${REPO_URL}" "${SRC_DIR}"
fi

if [[ "${GIT_REF}" == "dev" ]]; then
  warn "BOOTSTRAP_VERSION damgalanmamış (bu betik bir GitHub Release'den değil, doğrudan repo'dan çalıştırılıyor) — depo varsayılan dalı kullanılacak."
else
  git -C "${SRC_DIR}" checkout --force "${GIT_REF}"
fi
msg "Kaynak hazır: ${SRC_DIR}"

# ------------------------------------------------------------
# 3) install.sh'a devret
# ------------------------------------------------------------
[[ -f "${SRC_DIR}/install.sh" ]] || die "install.sh bulunamadı (${SRC_DIR}). Sürüm/etiket doğru mu?"
hr
info "3/3 — install.sh'a devrediliyor..."
hr
exec bash "${SRC_DIR}/install.sh" "$@"
