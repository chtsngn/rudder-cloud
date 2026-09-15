#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Sunucu Yönetim Paneli — self-update.sh
#
# Panelin "Şimdi Güncelle ve Yeniden Başlat" düğmesinin arkasındaki
# ayrıcalıklı betik. Panel süreci (ayrıcalıksız `panel` kullanıcısı) bunu
# `sudo -n /bin/bash <bu dosya> --start ...` ile çağırır — doctor.sh'ın
# sudoers adım 2'si (SUPER_ADMIN web terminali için verilen şifresiz
# `/bin/bash` izni) sayesinde ek bir sudoers satırı gerekmez.
#
# NEDEN bu betik / NEDEN systemd-run:
#
#  1) Panel `/opt/sunucu-paneli` (PANEL_DIR) içinde çalışır. Bu dizin
#     install.sh'ın `rsync` ile kopyaladığı bir KOPYADIR ve `.git` İÇERMEZ.
#     Gerçek git klonu ("kaynak klon" — bootstrap.sh varsayılanı
#     /opt/sunucu-paneli-src, install.sh çalıştırılan yer) ayrıdır ve
#     root'a aittir. Eski güncelleyici `git fetch`'i panelin kendi cwd'sinde
#     denediği için "fatal: not a git repository" ile düşüyordu. Artık git
#     işlemleri root olarak, KAYNAK klonda yapılır; kaynak klonun yeri
#     install.sh tarafından PANEL_DIR/.env'e `PANEL_SRC_DIR=` olarak
#     yazılır (bkz. install.sh adım 3).
#
#  2) Resmi ve tek desteklenen güncelleme yolu install.sh'ı yeniden
#     çalıştırmaktır (idempotent; .env'e dokunmaz, rsync + npm install +
#     build + migrate + `systemctl restart panel`). Burada da farklı bir
#     "hafif" yol UYDURULMAZ — kaynak klonda etiket checkout edilir, sonra
#     aynen `install.sh --yes` çağrılır.
#
#  3) install.sh en sonda `systemctl restart panel` yapar. Güncelleyici
#     panel sürecinin ÇOCUĞU olarak çalışsaydı, panel.service'in cgroup'u
#     ile birlikte tam o anda öldürülürdü (KillMode=control-group) ve HTTP
#     yanıtı da asla dönmezdi. Bu yüzden `--start` modu asıl işi
#     `systemd-run` ile BAĞIMSIZ, geçici bir unit'e (${UNIT_NAME}) devreder
#     ve hemen döner; panel ilerlemeyi ${STATE_DIR} altındaki log/status
#     dosyalarından okuyup arayüzde canlı gösterir (GET /api/system/update).
#
# Kullanım:
#   self-update.sh --start <kaynak-klon-dizini> <etiket|latest>  (panel çağırır)
#   self-update.sh --run   <kaynak-klon-dizini> <etiket|latest>  (systemd-run içinden)
#
# Çıkış kodları (--start): 0 başlatıldı · 3 zaten çalışıyor · 1 diğer hata
# ============================================================

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'

msg()  { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠  $*${NC}" >&2; }
die()  { echo -e "${RED}❌ $*${NC}" >&2; exit 1; }
info() { echo -e "${CYAN}$*${NC}"; }
hr()   { echo -e "${GRAY}------------------------------------------------------------${NC}"; }

[[ ${EUID} -eq 0 ]] || die "Bu betik root olarak çalıştırılmalı (sudo ile çağrılmalı)."

UNIT_NAME="panel-self-update"
STATE_DIR="/var/log/panel-update"
LOG_FILE="${STATE_DIR}/update.log"
STATUS_FILE="${STATE_DIR}/status.json"
SELF="$(readlink -f "${BASH_SOURCE[0]}")"

ABS_PATH_RE='^/[A-Za-z0-9_./-]+$'
# 'latest' ya da v1.2.3 / 1.2.3 / v1.2.3-rc.1 gibi bir sürüm etiketi.
REF_RE='^(latest|v?[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?)$'

MODE="${1:-}"
SRC_DIR="${2:-}"
REF="${3:-}"

[[ "${MODE}" == "--start" || "${MODE}" == "--run" ]] || die "Kullanım: self-update.sh --start|--run <kaynak-klon-dizini> <etiket|latest>"
[[ "${SRC_DIR}" =~ ${ABS_PATH_RE} ]] || die "Geçersiz kaynak klon dizini: '${SRC_DIR}'"
[[ "${REF}" =~ ${REF_RE} ]] || die "Geçersiz sürüm etiketi: '${REF}'"
[[ -d "${SRC_DIR}/.git" ]] || die "Kaynak klon bulunamadı: ${SRC_DIR} bir git deposu değil. install.sh'ı klonun içinden (sudo bash install.sh --yes) bir kez elle çalıştırın; kaynak klonun yeri .env'e (PANEL_SRC_DIR) kaydedilir."
[[ -f "${SRC_DIR}/install.sh" ]] || die "Kaynak klonda install.sh yok: ${SRC_DIR}"
[[ -d "${SRC_DIR}/panel" ]] || die "Kaynak klonda panel/ yok: ${SRC_DIR}"

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# JSON string kaçışı (jq bağımlılığı olmadan): ters bölü ve çift tırnak.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "${s}"
}

STARTED_AT="${STARTED_AT:-$(now_iso)}"

# write_status <state> <ref> <mesaj> [finishedAt]
write_status() {
  local state="$1" ref="$2" message="$3" finished="${4:-}"
  local tmp
  tmp="$(mktemp "${STATE_DIR}/.status.XXXXXX")"
  {
    printf '{'
    printf '"state":"%s",' "$(json_escape "${state}")"
    printf '"ref":"%s",' "$(json_escape "${ref}")"
    printf '"sourceDir":"%s",' "$(json_escape "${SRC_DIR}")"
    printf '"startedAt":"%s",' "${STARTED_AT}"
    printf '"finishedAt":%s,' "$([[ -n "${finished}" ]] && printf '"%s"' "${finished}" || printf 'null')"
    printf '"message":"%s"' "$(json_escape "${message}")"
    printf '}\n'
  } > "${tmp}"
  chmod 0644 "${tmp}"
  mv -f "${tmp}" "${STATUS_FILE}"
}

# ------------------------------------------------------------
# --start: doğrula, log/status'u sıfırla, işi bağımsız unit'e devret
# ------------------------------------------------------------
if [[ "${MODE}" == "--start" ]]; then
  command -v systemd-run >/dev/null 2>&1 || die "systemd-run bulunamadı — panel içi güncelleme yalnızca systemd tabanlı sistemlerde desteklenir. Elle: cd ${SRC_DIR} && sudo git fetch --tags && sudo git checkout tags/${REF} && sudo bash install.sh --yes"

  if systemctl is-active --quiet "${UNIT_NAME}" 2>/dev/null; then
    echo "Bir güncelleme zaten çalışıyor (${UNIT_NAME})." >&2
    exit 3
  fi

  mkdir -p "${STATE_DIR}"
  chmod 0755 "${STATE_DIR}"
  : > "${LOG_FILE}"
  chmod 0644 "${LOG_FILE}"
  write_status running "${REF}" "Güncelleme başlatılıyor..."

  # Önceki çalıştırma 'failed' durumunda kaldıysa aynı unit adı yeniden
  # kullanılamaz — temizle (--collect bunu zaten yapar, çifte güvence).
  systemctl reset-failed "${UNIT_NAME}" >/dev/null 2>&1 || true

  if ! systemd-run --quiet --collect \
      --unit="${UNIT_NAME}" \
      --description="Sunucu Yönetim Paneli — panel içi güncelleme (${REF})" \
      --setenv=STARTED_AT="${STARTED_AT}" \
      /bin/bash "${SELF}" --run "${SRC_DIR}" "${REF}"; then
    write_status failed "${REF}" "Güncelleme birimi (systemd-run) başlatılamadı." "$(now_iso)"
    die "systemd-run başarısız oldu."
  fi

  echo "started"
  exit 0
fi

# ------------------------------------------------------------
# --run: asıl iş (systemd-run altında, panel.service'den bağımsız)
# ------------------------------------------------------------
exec >>"${LOG_FILE}" 2>&1
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export DEBIAN_FRONTEND=noninteractive

SUCCESS=0
RESOLVED_REF="${REF}"
on_exit() {
  local rc=$?
  if [[ "${SUCCESS}" -ne 1 ]]; then
    write_status failed "${RESOLVED_REF}" "Güncelleme başarısız oldu (çıkış kodu ${rc}). Ayrıntılar için aşağıdaki günlüğe bakın; sunucuda: ${LOG_FILE}" "$(now_iso)"
    hr
    warn "Güncelleme BAŞARISIZ (çıkış kodu ${rc}). Panel yeniden başlatılmadıysa eski sürüm çalışmaya devam eder."
    warn "Elle tamamlamak için: cd ${SRC_DIR} && sudo bash install.sh --yes"
  fi
}
trap on_exit EXIT

hr
info "Sunucu Yönetim Paneli — panel içi güncelleme"
info "Başlangıç: ${STARTED_AT} · kaynak klon: ${SRC_DIR} · hedef: ${REF}"
hr

# Kaynak klon root dışı bir kullanıcıya ait olabilir (elle `git clone` sonra
# `sudo bash install.sh`) — git ≥2.35.2 bunu "dubious ownership" ile reddeder;
# bu klona özel safe.directory ver.
git_src() { git -c "safe.directory=${SRC_DIR}" -C "${SRC_DIR}" "$@"; }

write_status running "${REF}" "GitHub'dan etiketler çekiliyor..."
info "1/3 — git fetch --tags origin"
git_src fetch --tags --force --prune origin

if [[ "${REF}" == "latest" ]]; then
  RESOLVED_REF="$(git_src tag -l 'v*' --sort=-v:refname | head -n 1)"
  [[ -n "${RESOLVED_REF}" ]] || die "Depoda hiç sürüm etiketi (v*) bulunamadı."
  info "'latest' → ${RESOLVED_REF}"
fi

# Etiket adı bir dalla çakışabilir (v1.2.4'te yaşandı) — her zaman
# refs/tags/ ile açıkça etiketi hedefle, detached HEAD olarak çık ki kaynak
# klonun dalları (main) elle güncelleme alışkanlığı için bozulmasın.
git_src rev-parse -q --verify "refs/tags/${RESOLVED_REF}^{commit}" >/dev/null \
  || die "Etiket bulunamadı: ${RESOLVED_REF} (git fetch sonrası origin'de böyle bir etiket yok)."

PREV_COMMIT="$(git_src rev-parse --short HEAD)"
write_status running "${RESOLVED_REF}" "Kaynak kod ${RESOLVED_REF} sürümüne geçiriliyor..."
info "2/3 — git checkout --force --detach refs/tags/${RESOLVED_REF}"
git_src checkout --force --detach "refs/tags/${RESOLVED_REF}"
msg "Kaynak klon: ${PREV_COMMIT} → ${RESOLVED_REF} ($(git_src rev-parse --short HEAD))"

write_status running "${RESOLVED_REF}" "install.sh çalışıyor (bağımlılıklar, build, migration, servis yeniden başlatma) — birkaç dakika sürebilir..."
hr
info "3/3 — bash install.sh --yes"
hr
bash "${SRC_DIR}/install.sh" --yes </dev/null

SUCCESS=1
write_status success "${RESOLVED_REF}" "Güncelleme tamamlandı: ${RESOLVED_REF}. Panel yeniden başlatıldı." "$(now_iso)"
hr
msg "Panel içi güncelleme tamamlandı: ${RESOLVED_REF}"
