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
- [x] **Terminal Akıllı Komut Sistemi:**
  - **En Sık Kullanılan Komutlar Algoritması:** Çalıştırılan her komutun frekansı yerel olarak izlenip hızlı komut barında en çok kullanılanlar otomatik olarak öne çıkarılıyor.
  - **Sabitleme Sistemi (Pinning):** Yeni komut ekleme formuna \📌 Hızlı Bar'a Sabitle\ seçeneği eklendi; sabitlenen komutlar her zaman en önde kalıyor. Ayrıca Komut Kitaplığı'ndaki herhangi bir komut tek tıkla hızlı bara sabitlenebiliyor.
  - **Tam Oval Hızlı Komut Barı:** Alt komut barı dış kasası ve butonları tam oval (\ounded-full\) estetik kapsüle dönüştürüldü.
  - **Dengeli & Canlı Arama Destekli Komut Kitaplığı:** Renk dengesizlikleri giderildi, lüks kartlar ve anlık arama / filtreleme çubuğu ile kategori hapları eklendi.
  - **Sağa Tuttur Butonu:** Terminal üst başlığındaki buton neon ışıktan arındırılıp sade ve lüks **\Sağa Tuttur\** butonuna revize edildi.
- [x] **Sistem Ayarları (\/settings\) Sayfası Temaya Uygun Olarak Yenilendi.**
- [x] **Kullanıcı Yönetimi (\/users\) Sayfası Lüks Tablo & Arama/Filtre Sistemiyle Yenilendi.**
- [x] **Kalıcı Sağ Yan Terminal Dock'u & Rekürsif Sayfa Uyumlanması (Adaptive Split Screen).**
- [x] **Denetim Günlüğü (\/audit\) Sayfası & Kart Tasarımı Beyaz Temaya Tam Uyumlandı.**
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
| 2026-09-02 | Bordo/Altın Minimalist Terminal Rozeti ve \/audit\ Aydınlık Kart Uyarlaması | \side-terminal-dock.tsx\, \udit/page.tsx\ | Başarılı (TypeScript 0 hata) |
| 2026-09-02 | Oval Hızlı Komut Barı, En Sık Kullanılanlar Sıralaması, Sabitleme (Pin) ve Arama Destekli Komut Kitaplığı | \	erminal-view.tsx\, \	erminal/page.tsx\ | Başarılı (TypeScript 0 hata) |
