/**
 * Next.js sunucu-boot kancası (`register()` sunucu süreci ilk kez
 * ayağa kalktığında bir kez çağrılır). Yalnızca gerçek Node.js sunucu
 * sürecinde (edge runtime'da DEĞİL) uygulama-içi zamanlayıcıları başlatır —
 * bkz. `src/lib/auto-pull-scheduler.ts` ve `src/lib/backup-scheduler.ts`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoPullScheduler } = await import("@/lib/auto-pull-scheduler")
    startAutoPullScheduler()

    const { startBackupScheduler } = await import("@/lib/backup-scheduler")
    startBackupScheduler()
  }
}
