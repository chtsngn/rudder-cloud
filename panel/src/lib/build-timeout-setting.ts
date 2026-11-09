/**
 * Derleme zaman aşımı ayarını HER çağrıda veritabanından okur (önbellek yok):
 * Ayarlar ekranındaki değişiklik panel yeniden başlatılmadan bir sonraki
 * deploy'da geçerli olur. Kurallar: src/lib/build-timeout.ts.
 */
import { buildTimeoutMs } from "@/lib/build-timeout"
import { prisma } from "@/lib/prisma"

const PANEL_SETTINGS_ID = "panel"

/** ms cinsinden üst sınır; 0 = sınırsız (varsayılan). */
export async function getBuildTimeoutMs(): Promise<number> {
  try {
    const settings = await prisma.panelSettings.findUnique({
      where: { id: PANEL_SETTINGS_ID },
      select: { buildTimeoutMinutes: true },
    })
    return buildTimeoutMs(settings?.buildTimeoutMinutes)
  } catch (error) {
    // Ayar okunamazsa varsayılan (sınırsız) — derlemeyi bir ayar okuması yüzünden öldürmeyelim.
    console.error("Derleme zaman aşımı ayarı okunamadı, sınırsız varsayılıyor:", error)
    return 0
  }
}
