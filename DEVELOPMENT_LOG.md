# Rudder Cloud — v1.1.0 Geliştirme ve Değişiklik Günlüğü (Development Log)

**Branch:** \1.1.0\  
**Başlangıç Tarihi:** 2026-09-02  
**Geliştirme Yaklaşımı:** Yüksek özen, detaylı planlama, yaratıcı UI/UX tasarımı, tam TypeScript/ESLint/Build doğrulama ve kontrollü ilerleme.

---

## 📋 1. Mevcut Mimari ve Proje Durumu Özeti

- **Framework & Runtime:** Next.js 16.3.3 (App Router), React 19.2.8, Node.js 20+
- **Stil & Tasarım:** Tailwind CSS v4, Radix UI & shadcn/ui temelli bileşenler, Lucide React ikonları
- **Tema:** Yelken Kavisli Bordo Sidebar + Beyaz Aydınlık (\#f8fafc\) Çalışma Alanı + Kaptan Köşkü Donanım Telemetrisi + Siteler Yönetim Paneli.
- **Tipografi:** Google Fonts \Cinzel\ (Başlıklar / Brand wordmark), \Plus Jakarta Sans\ (Arayüz / Gövde metinleri), \JetBrains Mono\ (Kod & Metrikler)
- **Veritabanı & ORM:** PostgreSQL + Prisma 7 (@prisma/adapter-pg)
- **Kimlik & Güvenlik:** JWT tabanlı oturum yönetimi (jose, bcryptjs, httpOnly cookie), RBAC (SUPER_ADMIN, MEMBER), AES-256-GCM şifreleme

---

## 🎯 2. v1.1.0 Hedefleri & Yol Haritası

- [x] **Branch Kurulumu:** \1.1.0\ dalı oluşturuldu ve geçiş yapıldı.
- [x] **Yerel Çalışma Ortamı:** PostgreSQL Docker konteyneri ve Next.js dev sunucusu ayağa kaldırıldı.
- [x] **Siteler Yönetim Sayfası (\/sites\) ve Yeni Site Sihirbazı (\/sites/new\) Yenilendi:**
  - Özel \/sites\ sayfası oluşturuldu: Arama, tür filtresi (WordPress, Node.js, Python, PHP, Ters Proxy, Statik), durum filtresi ve durum özet kartları (Çalışan, Durdurulan, Hatalı) eklendi.
  - \SiteCard\ bileşeni zenginleştirildi; framework ikon rozetleri, Nginx durumu, canlı durum göstergesi ve yönetim kontrolleriyle donatıldı.
  - \/sites/new\ sihirbazı yeni temamıza uygun altın rozetli adım göstergesi, zengin kart seçimleri ve elit bordo/altın butonlarla baştan aşağı yenilendi.
- [x] **Site Detay & Yönetim Sayfası (\/sites/[id]\) Tablı Elit Tasarıma Dönüştürüldü:**
  - Tek uzun ve yorucu sayfa yerine **5 Özel Sekmeli (Tabs)** mimari kuruldu:
    1. **Genel Bakış & Ayarlar (Overview):** CPU & RAM Telemetrisi, Hızlı Ters Proxy Upstream URL Güncelleme, Yapılandırma Metadata Tablosu.
    2. **Git & Otomatik Dağıtım (Git):** Repo/Branch ayarları, Otomatik Pull aralığı, Process Manager ve GitHub Deploy/Actions anahtar yönetimi.
    3. **Yedekler & S3 (Backups):** Otomatik veritabanı yedekleme ve AWS S3 entegrasyonu.
    4. **Erişim Yetkileri (Access):** Site düzeyinde üye yetkilendirmeleri.
    5. **Servis Logları (Logs):** Canlı systemd / stdout-stderr terminal akışı.
  - Üst Kısım: Şık oval geri dönüş butonu, büyük marka domain başlığı, canlı durum rozeti (pulsing dot), hızlı siteyi aç bağlantısı, dosya yöneticisi ve servis başlatma/durdurma/yeniden başlatma kontrolleri ile donatıldı.
- [x] **Test & Doğrulama:** TypeScript typecheck (\
px tsc --noEmit\ -> 0 Hata), HTTP 200/307 doğrulandı.

---

## 📝 3. Yapılan Değişiklikler ve Doğrulama Kayıtları

| Tarih | İşlem / Değişiklik | Etkilenen Dosyalar | Doğrulama Durumu |
|---|---|---|---|
| 2026-09-02 | \1.1.0\ dalı oluşturuldu, yerel ortam ayağa kaldırıldı | Git branch, Docker, .env | Başarılı (200 OK) |
| 2026-09-02 | \/sites\ sayfası oluşturuldu, \SiteCard\ ve \/sites/new\ sihirbazı temaya uygun yenilendi | \sites/page.tsx\, \sites/new/page.tsx\, \site-card.tsx\ | Başarılı (TypeScript 0 hata, HTTP 200) |
| 2026-09-02 | \/sites/[id]\ detay sayfası tablı mimariye ve lüks denizci temasına geçirildi | \sites/[id]/page.tsx\ | Başarılı (TypeScript 0 hata) |
