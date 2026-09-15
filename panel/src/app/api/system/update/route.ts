import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { logAudit } from "@/lib/audit"
import { APP_VERSION, compareSemver } from "@/lib/version"
import {
  DEFAULT_SOURCE_DIR,
  isUpdateUnitActive,
  isValidUpdateRef,
  readUpdateStatus,
  resolveSourceDir,
  SelfUpdateStartError,
  startSelfUpdate,
} from "@/lib/self-update"

/**
 * Panel içi güncelleme.
 *
 * POST — güncellemeyi BAŞLATIR ve hemen döner. Asıl iş (git fetch/checkout
 *        kaynak klonda + install.sh --yes) root olarak, panel.service'den
 *        bağımsız geçici bir systemd unit'inde çalışır; çünkü install.sh
 *        sonunda paneli yeniden başlatır ve panelin çocuğu olan bir süreç
 *        o anda onunla birlikte ölürdü. Bkz. scripts/self-update.sh.
 * GET  — status.json + log kuyruğunu döndürür; arayüz bunu 2-3 sn'de bir
 *        sorgulayarak canlı ilerleme gösterir (panel yeniden başlarken
 *        birkaç istek başarısız olur, arayüz bunu tolere eder).
 */

async function requireSuperAdmin() {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) return null
  return session
}

export async function GET() {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok (Süper Yönetici gerekli)." }, { status: 403 })
  }

  const status = await readUpdateStatus()
  // status.json 'running' diyor ama unit yoksa (sunucu yeniden başladı,
  // süreç öldürüldü...) arayüz sonsuza kadar beklemesin.
  if (status.state === "running" && !(await isUpdateUnitActive())) {
    return NextResponse.json({
      ...status,
      state: "failed",
      message:
        status.message && status.message.includes("başlatılıyor")
          ? "Güncelleme birimi başlatılamadı ya da beklenmedik şekilde sonlandı. Ayrıntılar için günlüğe bakın."
          : "Güncelleme süreci beklenmedik şekilde sonlandı (unit artık çalışmıyor). Ayrıntılar için günlüğe bakın.",
    })
  }
  return NextResponse.json(status)
}

export async function POST(request: Request) {
  const session = await requireSuperAdmin()
  if (!session) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok (Süper Yönetici gerekli)." }, { status: 403 })
  }

  let body: { targetVersion?: unknown } = {}
  try {
    body = await request.json()
  } catch {}

  const ref =
    typeof body.targetVersion === "string" && body.targetVersion.trim() ? body.targetVersion.trim() : "latest"
  if (!isValidUpdateRef(ref)) {
    return NextResponse.json({ ok: false, error: `Geçersiz sürüm etiketi: ${ref}` }, { status: 400 })
  }
  // Aynı ya da DAHA ESKİ bir sürüme "güncelleme" başlatılmaz (2026-09-15: bayat
  // bir sürüm kontrolü modalda v1.3.1'deyken v1.3.0'ı sunuyordu — bu, migration'ları
  // geri alamayan bir düşürme olurdu). Bilerek geri dönmek isteyen `install.sh`'ı
  // elle çalıştırır.
  if (ref !== "latest") {
    const target = ref.startsWith("v") ? ref : `v${ref}`
    if (compareSemver(target, APP_VERSION) <= 0) {
      return NextResponse.json(
        { ok: false, error: `${target} mevcut sürümden (${APP_VERSION}) daha yeni değil — güncelleme başlatılmadı.` },
        { status: 400 }
      )
    }
  }

  const sourceDir = resolveSourceDir()
  if (!sourceDir) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Kaynak git klonu bulunamadı. Panel bir rsync kopyasında çalışır (.git içermez); güncelleme için ` +
          `install.sh'ın çalıştırıldığı klon gerekir (varsayılan: ${DEFAULT_SOURCE_DIR}). ` +
          `Sunucuda klonun içinden bir kez 'sudo bash install.sh --yes' çalıştırın — klonun yeri .env'e ` +
          `(PANEL_SRC_DIR) kaydedilir ve panel içi güncelleme çalışır hale gelir.`,
      },
      { status: 400 }
    )
  }

  try {
    await startSelfUpdate(sourceDir, ref)
  } catch (error) {
    if (error instanceof SelfUpdateStartError) {
      if (error.status === 409) {
        return NextResponse.json({ ok: true, alreadyRunning: true, message: error.message }, { status: 409 })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Güncelleme başlatılamadı." },
      { status: 500 }
    )
  }

  try {
    await logAudit({
      userId: session.userId,
      action: "UPDATE",
      targetType: "SYSTEM",
      targetId: "panel",
      detail: JSON.stringify({ targetVersion: ref, sourceDir }),
    })
  } catch {}

  return NextResponse.json({
    ok: true,
    started: true,
    message: "Güncelleme arka planda başlatıldı.",
    sourceDir,
    targetVersion: ref,
  })
}
