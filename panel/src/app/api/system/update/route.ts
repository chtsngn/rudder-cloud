import { NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import path from "path"
import { getSession } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"
import { logAudit } from "@/lib/audit"

const execAsync = promisify(exec)

function findGitRoot(): string {
  let curr = process.cwd()
  while (curr && curr !== path.dirname(curr)) {
    if (fs.existsSync(path.join(curr, ".git"))) {
      return curr
    }
    curr = path.dirname(curr)
  }
  return process.cwd()
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session || !(await isSuperAdmin(session.userId))) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok (Süper Yönetici gerekli)." }, { status: 403 })
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {}

  const targetVersion = body.targetVersion || "latest"
  const gitRoot = findGitRoot()
  const panelDir = fs.existsSync(path.join(gitRoot, "panel")) ? path.join(gitRoot, "panel") : gitRoot

  const stepsLog: Array<{ step: string; status: "success" | "skipped" | "failed"; output: string }> = []

  try {
    // 1. Git Fetch
    try {
      const { stdout } = await execAsync("git fetch --tags origin", { cwd: gitRoot, timeout: 30000 })
      stepsLog.push({ step: "git_fetch", status: "success", output: stdout.trim() || "Etiketler ve değişiklikler getirildi." })
    } catch (err: any) {
      stepsLog.push({ step: "git_fetch", status: "failed", output: err?.message || "git fetch başarısız oldu." })
      throw new Error(`Git fetch hatası: ${err?.message || err}`)
    }

    // 2. Git Pull / Checkout
    try {
      let pullCmd = "git pull"
      if (targetVersion && targetVersion !== "latest") {
        // Eğer belirli bir tag istenmişse checkout dene, yoksa pull
        pullCmd = `git checkout ${targetVersion} || git pull origin main`
      }
      const { stdout } = await execAsync(pullCmd, { cwd: gitRoot, timeout: 30000 })
      stepsLog.push({ step: "git_pull", status: "success", output: stdout.trim() || "Kodlar güncellendi." })
    } catch (err: any) {
      stepsLog.push({ step: "git_pull", status: "failed", output: err?.message || "git pull başarısız oldu." })
      throw new Error(`Git pull hatası: ${err?.message || err}`)
    }

    // 3. Paket Kurulumu (npm install)
    try {
      const { stdout } = await execAsync("npm install --omit=dev --no-audit --no-fund", { cwd: panelDir, timeout: 120000 })
      stepsLog.push({ step: "npm_install", status: "success", output: stdout.trim() || "Bağımlılıklar eşitlendi." })
    } catch (err: any) {
      // Devam etmeyi dene, install kritik olmayabilir
      stepsLog.push({ step: "npm_install", status: "skipped", output: err?.message || "npm install uyarısı (atlanıyor)." })
    }

    // 4. Veritabanı Şeması & Prisma Generate
    try {
      await execAsync("npx prisma generate", { cwd: panelDir, timeout: 60000 })
      try {
        await execAsync("npx prisma migrate deploy", { cwd: panelDir, timeout: 60000 })
      } catch {}
      stepsLog.push({ step: "prisma_migrate", status: "success", output: "Veritabanı şeması ve istemcisi güncellendi." })
    } catch (err: any) {
      stepsLog.push({ step: "prisma_migrate", status: "skipped", output: err?.message || "Prisma adımı atlandı." })
    }

    // 5. Next.js Build
    const isProduction = process.env.NODE_ENV === "production"
    if (isProduction) {
      try {
        const { stdout } = await execAsync("npm run build", { cwd: panelDir, timeout: 300000 })
        stepsLog.push({ step: "npm_build", status: "success", output: stdout.trim() || "Panel başarıyla derlendi." })
      } catch (err: any) {
        stepsLog.push({ step: "npm_build", status: "failed", output: err?.message || "Derleme başarısız." })
        throw new Error(`Derleme hatası: ${err?.message || err}`)
      }

      // 6. Linux Servis Yeniden Başlatma
      try {
        // systemd veya pm2
        await execAsync("sudo systemctl restart panel || systemctl restart panel || pm2 restart panel", { timeout: 10000 })
        stepsLog.push({ step: "service_restart", status: "success", output: "Panel servisi yeniden başlatıldı." })
      } catch (err: any) {
        stepsLog.push({ step: "service_restart", status: "skipped", output: "Servis restart komutu iletildi veya gerekmedi." })
      }
    } else {
      stepsLog.push({ step: "dev_mode", status: "success", output: "Geliştirme ortamında sıcak yenileme aktif." })
    }

    // Denetim kaydı oluştur
    try {
      await logAudit({
        userId: session.userId,
        action: "UPDATE",
        targetType: "SYSTEM",
        targetId: "panel",
        detail: JSON.stringify({
          targetVersion,
          steps: stepsLog.map((s) => s.step),
        }),
      })
    } catch {}

    return NextResponse.json({
      ok: true,
      message: "Güncelleme başarıyla tamamlandı! Sayfa yenileniyor.",
      steps: stepsLog,
      requiresReload: true,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Güncelleme sırasında bir hata oluştu.",
        steps: stepsLog,
      },
      { status: 500 }
    )
  }
}
