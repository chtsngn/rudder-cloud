#!/usr/bin/env bash
set -euo pipefail
# ============================================================
# GitHub Actions SSH Key Setup (interactive)
# Amaç: GitHub Actions'ın sunucuya SSH ile bağlanması için
#       gereken SSH_PRIVATE_KEY secret'ını hazırlamak.
#
# Mantık (deploy key'in TERSİ yönü):
#   - PUBLIC key  -> sunucudaki ~/.ssh/authorized_keys
#   - PRIVATE key -> GitHub Actions secret: SSH_PRIVATE_KEY
# ============================================================
msg()      { echo -e "✅ $*"; }
warn()     { echo -e "⚠  $*" >&2; }
die()      { echo -e "❌ $*" >&2; exit 1; }
hr()       { echo "------------------------------------------------------------"; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Komut bulunamadı: $1"; }
need_cmd ssh-keygen
need_cmd grep
SSH_DIR="${HOME}/.ssh"
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"
echo "============================================"
echo " GitHub Actions SSH Key Setup"
echo " SSH dizini: ${SSH_DIR}"
echo "============================================"
echo
# ------------------------------------------------------------
# 1) Private key kaynağını seç
# ------------------------------------------------------------
echo "Private key kaynağı:"
echo "  1) Mevcut özel anahtarı kullan (örn. sunucuya zaten bağlandığın ~/.ssh/id_ed25519)"
echo "  2) Actions için yeni, özel bir anahtar oluştur (önerilen)"
echo
read -r -p "Seçim [1/2]: " CHOICE
KEY_FILE=""
case "${CHOICE}" in
  1)
    read -r -p "Anahtar dosyası [~/.ssh/id_ed25519]: " KEY_FILE
    KEY_FILE="${KEY_FILE:-${SSH_DIR}/id_ed25519}"
    # ~ kısaltmasını aç
    KEY_FILE="${KEY_FILE/#\~/${HOME}}"
    [[ -f "${KEY_FILE}" ]] || die "Anahtar bulunamadı: ${KEY_FILE}"
    msg "Kullanılacak anahtar: ${KEY_FILE}"
    # passphrase kontrolü (Actions passphrase'siz bekler)
    if ! ssh-keygen -y -P "" -f "${KEY_FILE}" >/dev/null 2>&1; then
      warn "Bu anahtar passphrase korumalı görünüyor."
      warn "GitHub Actions passphrase'siz bir anahtar bekler — 2. seçenekle yeni anahtar oluşturman önerilir."
    fi
    warn "Not: Bu anahtarın public'i sunucudaki authorized_keys'de zaten olmalı (yoksa giriş yapamazdın)."
    ;;
  2)
    read -r -p "Anahtar dosya adı [prosicht_actions_server]: " KEY_NAME
    KEY_NAME="${KEY_NAME:-prosicht_actions_server}"
    KEY_NAME="$(echo "${KEY_NAME}" | tr ' ' '_' | tr -cd 'a-zA-Z0-9._-')"
    [[ -n "${KEY_NAME}" ]] || die "Geçersiz anahtar adı."
    KEY_FILE="${SSH_DIR}/${KEY_NAME}"
    if [[ -f "${KEY_FILE}" ]]; then
      warn "Anahtar zaten var: ${KEY_FILE} (yeniden üretilmiyor)."
    else
      # Actions interaktif passphrase giremez -> her zaman -N ""
      msg "Passphrase'siz anahtar üretiliyor (Actions için zorunlu)..."
      ssh-keygen -t ed25519 -C "${KEY_NAME}" -f "${KEY_FILE}" -N "" >/dev/null
      chmod 600 "${KEY_FILE}"
      chmod 644 "${KEY_FILE}.pub"
      msg "Anahtar üretildi: ${KEY_FILE}"
    fi
    # public key dosyası yoksa private'tan türet
    PUB_FILE="${KEY_FILE}.pub"
    [[ -f "${PUB_FILE}" ]] || ssh-keygen -y -f "${KEY_FILE}" > "${PUB_FILE}"
    echo
    read -r -p "Bu scripti deploy hedefi olan SUNUCUDA mı çalıştırıyorsun? [e/H]: " ON_SERVER
    if [[ "${ON_SERVER}" =~ ^[Ee]$ ]]; then
      AUTH_KEYS="${SSH_DIR}/authorized_keys"
      touch "${AUTH_KEYS}"
      chmod 600 "${AUTH_KEYS}"
      if grep -qF "$(cat "${PUB_FILE}")" "${AUTH_KEYS}"; then
        warn "Public key authorized_keys içinde zaten var (atlanıyor)."
      else
        # dosya newline ile bitmiyorsa önce newline ekle
        if [[ -s "${AUTH_KEYS}" ]] && [[ "$(tail -c1 "${AUTH_KEYS}" | wc -l)" -eq 0 ]]; then
          echo >> "${AUTH_KEYS}"
        fi
        cat "${PUB_FILE}" >> "${AUTH_KEYS}"
        msg "Public key eklendi: ${AUTH_KEYS}"
      fi
    else
      hr
      echo "🔑 PUBLIC KEY — sunucudaki ~/.ssh/authorized_keys dosyasına ekle:"
      hr
      cat "${PUB_FILE}"
      hr
      echo
      read -r -p "Sunucuya ssh ile şimdi eklemek ister misin? user@host (boş = atla): " SSH_TARGET
      if [[ -n "${SSH_TARGET}" ]]; then
        if command -v ssh-copy-id >/dev/null 2>&1; then
          if ssh-copy-id -i "${PUB_FILE}" "${SSH_TARGET}"; then
            msg "Public key sunucuya eklendi: ${SSH_TARGET}"
          else
            warn "ssh-copy-id başarısız oldu. Yukarıdaki public key'i sunucuya elle ekle."
          fi
        else
          warn "ssh-copy-id bulunamadı. Yukarıdaki public key'i sunucuya elle ekle."
        fi
      fi
    fi
    ;;
  *)
    die "Geçersiz seçim."
    ;;
esac
# ------------------------------------------------------------
# 2) Private key'i SSH_PRIVATE_KEY secret'ı olarak ver
# ------------------------------------------------------------
echo
hr
echo "🔐 SSH_PRIVATE_KEY (GitHub Actions secret)"
hr
SECRET_SET=0
if command -v gh >/dev/null 2>&1; then
  read -r -p "gh CLI bulundu. Secret'ı otomatik ekleyeyim mi? [e/H]: " USE_GH
  if [[ "${USE_GH}" =~ ^[Ee]$ ]]; then
    read -r -p "Repo (owner/repo) [boş = bulunduğun dizindeki repo]: " REPO_SLUG
    if [[ -n "${REPO_SLUG}" ]]; then
      if gh secret set SSH_PRIVATE_KEY -R "${REPO_SLUG}" < "${KEY_FILE}"; then
        msg "Secret eklendi: SSH_PRIVATE_KEY -> ${REPO_SLUG}"
        SECRET_SET=1
      else
        warn "gh ile eklenemedi. Manuel yönteme geçiliyor."
      fi
    else
      if gh secret set SSH_PRIVATE_KEY < "${KEY_FILE}"; then
        msg "Secret eklendi: SSH_PRIVATE_KEY -> (bulunduğun repo)"
        SECRET_SET=1
      else
        warn "gh ile eklenemedi (bir git repo dizininde misin?). Manuel yönteme geçiliyor."
      fi
    fi
  fi
fi
if [[ "${SECRET_SET}" -eq 0 ]]; then
  echo "GitHub: Repo > Settings > Secrets and variables > Actions > New repository secret"
  echo "Secret adı: SSH_PRIVATE_KEY"
  warn "Private key aşağıda yazdırılıyor — güvenli tut, kimseyle paylaşma."
  hr
  cat "${KEY_FILE}"
  hr
  echo "⚠  '-----BEGIN ...-----' ve '-----END ...-----' satırları dahil TÜM içeriği kopyala (sondaki boş satır dahil)."
  echo "💡 Kopyaladıktan sonra istersen terminal geçmişini ve scrollback'i temizle (history -c)."
fi
echo
msg "Bitti."
