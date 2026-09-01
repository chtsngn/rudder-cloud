#!/usr/bin/env bash
set -euo pipefail
# ============================================================
# GitHub Deploy Key Setup (interactive, tek repo)
# - ~/.ssh altında ed25519 deploy key üretir
# - ~/.ssh/config içine projeye özel Host alias ekler
# - Public key'i GitHub Deploy Keys'e yapıştırmak için yazdırır
# - İsteğe bağlı olarak SSH bağlantısını test eder
# ============================================================
msg()      { echo -e "✅ $*"; }
warn()     { echo -e "⚠  $*" >&2; }
die()      { echo -e "❌ $*" >&2; exit 1; }
hr()       { echo "------------------------------------------------------------"; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Komut bulunamadı: $1"; }
need_cmd ssh-keygen
need_cmd grep
need_cmd tr
SSH_DIR="${HOME}/.ssh"
SSH_CONFIG="${SSH_DIR}/config"
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"
touch "${SSH_CONFIG}"
chmod 600 "${SSH_CONFIG}"
echo "============================================"
echo " GitHub Deploy Key Setup"
echo " SSH dizini: ${SSH_DIR}"
echo "============================================"
echo
# --- 1) Proje adı ---
read -r -p "Proje adı (örn: firesight): " PROJECT
[[ -n "${PROJECT}" ]] || die "Proje adı boş olamaz."
# sanitize: boşlukları _ yap, izinli karakter dışını at
PROJECT="$(echo "${PROJECT}" | tr ' ' '_' | tr -cd 'a-zA-Z0-9._-')"
[[ -n "${PROJECT}" ]] || die "Geçersiz proje adı."
# _deploy ekini yalnızca bir kez ekle
if [[ "${PROJECT}" == *_deploy ]]; then
  KEY_NAME="${PROJECT}"
else
  KEY_NAME="${PROJECT}_deploy"
fi
KEY_FILE="${SSH_DIR}/${KEY_NAME}"
HOST_ALIAS="github.com-${KEY_NAME}"
echo
msg "Anahtar adı : ${KEY_NAME}"
msg "Anahtar yolu: ${KEY_FILE}"
msg "Host alias  : ${HOST_ALIAS}"
echo
# --- 2) Passphrase ---
read -r -p "Passphrase kullanılsın mı? (otomasyon için 'hayır' önerilir) [e/H]: " USE_PASS
USE_PASS="${USE_PASS:-H}"
# --- 3) Anahtarı üret ---
if [[ -f "${KEY_FILE}" ]]; then
  warn "Anahtar zaten var: ${KEY_FILE} (yeniden üretilmiyor)."
else
  msg "Anahtar üretiliyor..."
  if [[ "${USE_PASS}" =~ ^[Ee]$ ]]; then
    # ssh-keygen kendi passphrase sorusunu soracak
    ssh-keygen -t ed25519 -C "${KEY_NAME}" -f "${KEY_FILE}"
  else
    ssh-keygen -t ed25519 -C "${KEY_NAME}" -f "${KEY_FILE}" -N "" >/dev/null
  fi
  chmod 600 "${KEY_FILE}"
  chmod 644 "${KEY_FILE}.pub"
  msg "Anahtar üretildi."
fi
# --- 4) SSH config'e Host alias ekle (idempotent) ---
if grep -qE "^[[:space:]]*Host[[:space:]]+${HOST_ALIAS}[[:space:]]*$" "${SSH_CONFIG}"; then
  warn "SSH config içinde '${HOST_ALIAS}' zaten tanımlı (atlanıyor)."
else
  cat >> "${SSH_CONFIG}" <<EOF
Host ${HOST_ALIAS}
    HostName github.com
    User git
    IdentityFile ${KEY_FILE}
    IdentitiesOnly yes
EOF
  msg "SSH config güncellendi: Host ${HOST_ALIAS}"
fi
chmod 600 "${SSH_CONFIG}"
# --- 5) Public key'i göster ---
echo
hr
echo "🔑 PUBLIC KEY — GitHub'a yapıştır"
echo "   Repo > Settings > Deploy keys > Add deploy key"
echo "   Title: ${KEY_NAME}"
echo "   (Push/yazma gerekiyorsa 'Allow write access' kutusunu işaretle)"
hr
cat "${KEY_FILE}.pub"
hr
echo
# --- 6) Klonlama / remote komutları ---
read -r -p "GitHub owner/kullanıcı (örn: codextrasoft) [opsiyonel]: " OWNER
read -r -p "Repo adı (örn: my-repo) [opsiyonel]: " REPO
if [[ -n "${OWNER}" && -n "${REPO}" ]]; then
  CLONE_TARGET="${OWNER}/${REPO}.git"
else
  CLONE_TARGET="<owner>/<repo>.git"
fi
echo
echo "🧪 Test komutu:"
echo "   ssh -T git@${HOST_ALIAS}"
echo
echo "📦 Klonlama (alias ile!):"
echo "   git clone git@${HOST_ALIAS}:${CLONE_TARGET}"
echo
echo "🔁 Mevcut repo içindeysen remote'u güncelle:"
echo "   git remote set-url origin git@${HOST_ALIAS}:${CLONE_TARGET}"
echo
# --- 7) İsteğe bağlı bağlantı testi ---
read -r -p "Public key'i GitHub'a ekledin mi? Bağlantıyı şimdi test edeyim mi? [e/H]: " DO_TEST
if [[ "${DO_TEST}" =~ ^[Ee]$ ]]; then
  # authenticity prompt'unu atlamak için github.com'u known_hosts'a ekle
  if command -v ssh-keyscan >/dev/null 2>&1; then
    touch "${SSH_DIR}/known_hosts"
    chmod 644 "${SSH_DIR}/known_hosts"
    if ! grep -q "github.com" "${SSH_DIR}/known_hosts" 2>/dev/null; then
      ssh-keyscan -t ed25519 github.com >> "${SSH_DIR}/known_hosts" 2>/dev/null || true
    fi
  fi
  echo
  msg "Test ediliyor: ssh -T git@${HOST_ALIAS}"
  # GitHub başarılı kimlik doğrulamada bile exit 1 döner (shell erişimi vermez), o yüzden || true
  ssh -T "git@${HOST_ALIAS}" || true
  echo
  echo "ℹ  'Hi <kullanıcı>! You've successfully authenticated...' görüyorsan kurulum tamam."
fi
echo
msg "Bitti."
