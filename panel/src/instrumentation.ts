/**
 * Next.js sunucu-boot kancası (`register()` sunucu süreci ilk kez
 * ayağa kalktığında bir kez çağrılır). Yalnızca gerçek Node.js sunucu
 * sürecinde (edge runtime'da DEĞİL) uygulama-içi zamanlayıcıları başlatır —
 * bkz. `src/lib/auto-pull-scheduler.ts` ve `src/lib/backup-scheduler.ts`.
 *
 * 2026-11: zamanlayıcılardan ÖNCE önceki süreçten yarım kalan site işleri
 * (deploy, yedek, …) `interrupted` olarak işaretlenir (bkz. src/lib/site-jobs.ts).
 * Bu otomatik geri dönüş DEĞİLDİR; yalnız durum düzeltilir. Hata açılışı
 * durdurmaz.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { markInterruptedJobs } = await import("@/lib/site-jobs")
      await markInterruptedJobs()
    } catch (error) {
      console.error("[site-jobs] yarım kalan işler işaretlenemedi:", error)
    }

    const { startAutoPullScheduler } = await import("@/lib/auto-pull-scheduler")
    startAutoPullScheduler()

    const { startBackupScheduler } = await import("@/lib/backup-scheduler")
    startBackupScheduler()
  }
}
