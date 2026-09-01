/**
 * Hafif, best-effort denetim kaydı (Aşama G). Bilinçli tasarım kararı:
 * `logAudit()` ASLA çağıran işlemi engellemez/başarısız yapmaz — bir denetim
 * satırı yazılamasa bile (ör. DB o an erişilemezse) gerçek işlem (site
 * silme, kullanıcı oluşturma vb.) zaten TAMAMLANMIŞ olur; burada atılacak
 * bir hata kullanıcıya "işlem başarısız" gibi yanlış bir izlenim verirdi.
 * Bu yüzden hatalar yalnızca `console.error`'a düşer, hiçbir zaman throw
 * edilmez/await eden çağrıyı etkilemez.
 */
import { prisma } from "@/lib/prisma"

export interface LogAuditInput {
  userId: string
  action: string
  targetType?: string
  targetId?: string
  detail?: string
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { username: true } })
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        // `username` KASITLI denormalize — bkz. prisma/schema.prisma → AuditLog notu.
        username: user?.username ?? "(silinmiş kullanıcı)",
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
