/**
 * Hafif, best-effort denetim kaydı (Aşama G). Bilinçli tasarım kararı:
 * `logAudit()` ASLA çağıran işlemi engellemez/başarısız yapmaz — bir denetim
 * satırı yazılamasa bile (ör. DB o an erişilemezse) gerçek işlem (site
 * silme, kullanıcı oluşturma vb.) zaten TAMAMLANMIŞ olur; burada atılacak
 * bir hata kullanıcıya "işlem başarısız" gibi yanlış bir izlenim verirdi.
 * Bu yüzden hatalar yalnızca `console.error`'a düşer, hiçbir zaman throw
 * edilmez/await eden çağrıyı etkilemez.
 *
 * `userId` null olabilir (deploy hook / GitHub webhook gibi oturumsuz
 * tetikleyiciler) — o zaman `actor` etiketi `username` olarak yazılır.
 */
import { prisma } from "@/lib/prisma"

export interface LogAuditInput {
  userId: string | null
  /** Oturumsuz tetikleyiciler için görünen ad (ör. "deploy-hook", "github-webhook"). */
  actor?: string
  action: string
  targetType?: string
  targetId?: string
  detail?: string
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const user = input.userId
      ? await prisma.user.findUnique({ where: { id: input.userId }, select: { username: true } })
      : null
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        // `username` KASITLI denormalize — bkz. prisma/schema.prisma → AuditLog notu.
        username: user?.username ?? input.actor ?? "(silinmiş kullanıcı)",
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: input.detail ?? null,
      },
    })
  } catch (error) {
    console.error("Denetim kaydı yazılamadı (işlem yine de tamamlandı):", error)
  }
}
