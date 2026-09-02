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
- [x] **Siteler Yönetim Sayfası (\/sites\) ve Yeni Site Sihirbazı (\/sites/new\) Yenilendi.**
- [x] **Site Detay & Yönetim Sayfası (\/sites/[id]\) Tablı Elit Tasarıma Dönüştürüldü.**
- [x] **Navigasyon Erişimi Güçlendirildi (Sidebar & Anasayfa Siteler Linki).**
- [x] **Sunucu Terminali (\/terminal\) Lüks Kaptan Köşkü Konsoluna Dönüştürüldü.**
- [x] **Terminal Akıllı Komut Sistemi (Spotlight Paleti, Özel Komut Ekleme, Komut Kitaplığı).**
- [x] **Sistem Ayarları (\/settings\) Sayfası Temaya Uygun Olarak Yenilendi.**
- [x] **Kullanıcı Yönetimi (\/users\) Sayfası Lüks Tablo & Arama/Filtre Sistemiyle Yenilendi.**
- [x] **Sağa Tutturulabilir Kalıcı Terminal Dock'u & Rekürsif Sayfa Uyumlanması (Adaptive Split Layout):**
  - **Dinamik Sayfa Daralma / Sola Kayma (Responsive Main Margin):** Terminal açıldığında ana sayfa (\DashboardMain\) sağ kenar boşluğunu (\marginRight\) anlık olarak terminal genişliği kadar daraltır. Arkadaki siteler, tablolar, grafikler ve ayar kartları terminalin arkasında kalmaz; otomatik yeniden boyutlanıp %100 görünür ve tıklanabilir kalır.
  - **Sürüklemede Anlık Eşzamanlı Boyutlandırma:** Sürükleme tutamacı hareket ettirildikçe hem terminal hem de ana sayfa sıfır gecikmeyle eşzamanlı boyutlanır.
  - **Premium Obsidian & Altın Hızlı Komut Barı:** Terminal altındaki komut barı koyu obsidian ve altın parıltılı lüks kartlara dönüştürüldü. Üzerine gelindiğinde metin kaybolma hatası tamamen giderildi.
  - **Gemi Emojisi Kaldırıldı:** Terminal karşılama metnindeki gemi emojisi kaldırılarak profesyonel \>_ Rudder Cloud\ metnine geçirildi.
- [x] **Test & Doğrulama:** TypeScript typecheck (\
px tsc --noEmit\ -> 0 Hata), HTTP 200/307 doğrulandı.

---

## 📝 3. Yapılan Değişiklikler ve Doğrulama Kayıtları

| Tarih | İşlem / Değişiklik | Etkilenen Dosyalar | Doğrulama Durumu |
|---|---|---|---|
| 2026-09-02 | \1.1.0\ dalı oluşturuldu, yerel ortam ayağa kaldırıldı | Git branch, Docker, .env | Başarılı (200 OK) |
| 2026-09-02 | \/sites\ sayfası ve \/sites/new\ sihirbazı temaya uygun yenilendi | \sites/page.tsx\, \sites/new/page.tsx\, \site-card.tsx\ | Başarılı (TypeScript 0 hata, HTTP 200) |
| 2026-09-02 | \/sites/[id]\ detay sayfası tablı mimariye geçirildi | \sites/[id]/page.tsx\ | Başarılı (TypeScript 0 hata) |
| 2026-09-02 | \/terminal\ sayfası ve akıllı komut sistemi (\Ctrl+K\, özel komutlar, kitaplık) kuruldu | \	erminal/page.tsx\, \	erminal-view.tsx\ | Başarılı (TypeScript 0 hata) |
| 2026-09-02 | \/settings\ sayfası (Alan Adı/SSL ve S3 Depolama) lüks tasarımla yenilendi | \settings/page.tsx\ | Başarılı (TypeScript 0 hata) |
| 2026-09-02 | \/users\ sayfası lüks tablo, arama/filtre çubuğu ve avatar sistemiyle yenilendi | \users/page.tsx\ | Başarılı (TypeScript 0 hata) |
| 2026-09-02 | Kalıcı Yan Terminal, Rekürsif Sayfa Uyumlanması (\DashboardMain\) ve Obsidian Komut Barı | \dashboard-main.tsx\, \layout.tsx\, \	erminal-dock-context.tsx\, \	erminal-view.tsx\, \side-terminal-dock.tsx\ | Başarılı (TypeScript 0 hata) |
