/**
 * Gerçek RBAC uygulaması (Aşama G). SUPER_ADMIN her siteye/işleme her zaman
 * erişebilir — bunun için `UserSiteAccess` tablosunda hiç satır GEREKMEZ.
 * MEMBER yalnızca kendisine açıkça `UserSiteAccess` ile verilmiş sitelerde,
 * verilmiş izinler ölçüsünde erişebilir.
 *
 * Site-scoped route'ların (git, restart, dosyalar, backup, deploy key vb.)
 * HEPSİ bu TEK fonksiyon üzerinden geçiyor (bkz. grep `canManageSite(` —
 * `src/app/api/sites/[id]/**` altında ~20 çağrı noktası) — bu yüzden
 * buradaki mantık değiştiğinde TÜM site-scoped erişim kontrolü tek yerden
 * değişiyor, route'lar tek tek yamanmıyor.
 */
import type { Site } from "@prisma/client"

import { prisma } from "@/lib/prisma"

export type SitePermission =
  | "VIEW"
  | "EDIT_FILES"
  | "RESTART"
  | "DELETE"
  | "MANAGE_BACKUPS"
  | "MANAGE_DEPLOY_KEYS"

/** Kullanıcının rolünü döner (kullanıcı bulunamazsa null — silinmiş/geçersiz
 * oturum durumunda çağıranlar bunu "yetkisiz" olarak ele almalı). */
async function getUserRole(userId: string): Promise<"SUPER_ADMIN" | "MEMBER" | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return user?.role ?? null
}

/** `userId` bir SUPER_ADMIN mı? Kullanıcı/rol yönetimi, sistem ayarları
 * (S3, portlar, istatistikler) ve sunucu terminali gibi site-scoped
 * OLMAYAN ama tehlikeli işlemler için kullanılır. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  return (await getUserRole(userId)) === "SUPER_ADMIN"
}

export async function canManageSite(
  userId: string,
  site: Pick<Site, "id">,
  permission: SitePermission
): Promise<boolean> {
  const role = await getUserRole(userId)
  if (role === "SUPER_ADMIN") return true
  if (role !== "MEMBER") return false

  const access = await prisma.userSiteAccess.findUnique({
    where: { userId_siteId: { userId, siteId: site.id } },
  })
  return access ? access.permissions.includes(permission) : false
}
