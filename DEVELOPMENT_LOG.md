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
  - Özel \/sites\ sayfası oluşturuldu: Arama, tür filtresi, durum filtresi ve özet sayaçları.
  - \SiteCard\ bileşeni zenginleştirildi; framework rozetleri, Nginx durumu ve kontrol butonları eklendi.
  - \/sites/new\ sihirbazı altın rozetli adım göstergesi ve bordo/altın butonlarla yenilendi.
- [x] **Site Detay & Yönetim Sayfası (\/sites/[id]\) Tablı Elit Tasarıma Dönüştürüldü:**
  - 5 Özel Sekmeli mimari kuruldu: *Genel Bakış & Ayarlar*, *Git & Otomatik Dağıtım*, *Yedekler & S3*, *Erişim Yetkileri*, *Servis Logları*.
- [x] **Navigasyon Erişimi Güçlendirildi:**
  - Sol bordo menüye \Siteler\ linki eklendi.
  - Anasayfadaki "Siteleriniz" başlığına \Tüm Siteleri Yönet →\ bağlantısı yerleştirildi.
- [x] **Sunucu Terminali (\/terminal\) Lüks Kaptan Köşkü Konsoluna Dönüştürüldü:**
  - Üst Başlık: \Cinzel\ bordo başlık + altın/kehribar çerçeveli güvenlik uyarı bandı (\oot/sudo\ bilgilendirmesi).
  - Terminal Pencere Kasası (Workstation Frame): macOS tarzı 3'lü trafik ışığı butonları, \oot@rudder-cloud:~ (bash)\ etiketi, anlık bağlantı durum rozeti (Online/Offline/Connecting).
  - Konsol Kontrol Araçları: Canlı yazı boyutu büyütme/küçültme (\ZoomIn/ZoomOut\), konsolu temizleme (\Eraser\), hızlı yeniden bağlanma (\RotateCw\) ve tam ekran modu (\Fullscreen Toggle\).
  - Hızlı Komutlar Çubuğu: Tek tıkla çalıştırılabilen hazır komut çipleri (\htop\, \docker ps\, \
ginx -t\, \df -h\, \ree -m\, \uptime\, \journalctl\, \clear\).
  - xterm Renk Paleti: Lüks obsidiyen koyu tema (\#0a0d14\), altın imleç (\#dfc9a0\) ve yüksek kontrastlı renkler.
- [x] **Test & Doğrulama:** TypeScript typecheck (\
px tsc --noEmit\ -> 0 Hata), HTTP 200/307 doğrulandı.

---

## 📝 3. Yapılan Değişiklikler ve Doğrulama Kayıtları

| Tarih | İşlem / Değişiklik | Etkilenen Dosyalar | Doğrulama Durumu |
|---|---|---|---|
| 2026-09-02 | \1.1.0\ dalı oluşturuldu, yerel ortam ayağa kaldırıldı | Git branch, Docker, .env | Başarılı (200 OK) |
| 2026-09-02 | \/sites\ sayfası ve \/sites/new\ sihirbazı temaya uygun yenilendi | \sites/page.tsx\, \sites/new/page.tsx\, \site-card.tsx\ | Başarılı (TypeScript 0 hata, HTTP 200) |
| 2026-09-02 | \/sites/[id]\ detay sayfası tablı mimariye geçirildi | \sites/[id]/page.tsx\ | Başarılı (TypeScript 0 hata) |
| 2026-09-02 | \/terminal\ sayfası ve \	erminal-view.tsx\ lüks workstation konsoluna dönüştürüldü | \	erminal/page.tsx\, \	erminal-view.tsx\ | Başarılı (TypeScript 0 hata) |
