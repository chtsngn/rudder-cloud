# Rudder Cloud — v1.1.0 Geliştirme ve Değişiklik Günlüğü (Development Log)

**Branch:** \1.1.0\  
**Başlangıç Tarihi:** 2026-09-02  
**Geliştirme Yaklaşımı:** Yüksek özen, detaylı planlama, yaratıcı UI/UX tasarımı, tam TypeScript/ESLint/Build doğrulama ve kontrollü ilerleme.

---

## 📋 1. Mevcut Mimari ve Proje Durumu Özeti

- **Framework & Runtime:** Next.js 16.3.3 (App Router), React 19.2.8, Node.js 20+
- **Stil & Tasarım:** Tailwind CSS v4, Radix UI & shadcn/ui temelli bileşenler, Lucide React ikonları
- **Tema:** Derin Bordo (\#2e0911\) Sidebar + Beyaz / Aydınlık (\#f8fafc\) Ana Panel Arka Planı + Bronz/Altın (\#c8a87c\) Vurgular.
- **Tipografi:** Google Fonts \Cinzel\ (Başlıklar / Brand wordmark), \Plus Jakarta Sans\ (Arayüz / Gövde metinleri), \JetBrains Mono\ (Kod & Metrikler)
- **Veritabanı & ORM:** PostgreSQL + Prisma 7 (@prisma/adapter-pg)
- **Kimlik & Güvenlik:** JWT tabanlı oturum yönetimi (jose, bcryptjs, httpOnly cookie), RBAC (SUPER_ADMIN, MEMBER), AES-256-GCM şifreleme
- **Sistem & Entegrasyon:**
  - Site Yönetimi (WordPress, PHP, Node.js, Python, Static, Reverse Proxy)
  - Otomatik Git Dağıtımı & Periyodik Pull
  - Dosya Yöneticisi & Monaco Kod Editörü
  - Otomatik & S3 Entegreli Veritabanı Yedekleme
  - GitHub Deploy & Actions Anahtar Yönetimi
  - Web Terminali (xterm.js + node-pty)
  - Port Görüntüleyici (Docker + Yerel Portlar)
  - Denetim Kaydı (Audit Log)

---

## 🎯 2. v1.1.0 Hedefleri & Yol Haritası

- [x] **Branch Kurulumu:** \1.1.0\ dalı oluşturuldu ve geçiş yapıldı.
- [x] **Yerel Çalışma Ortamı:** PostgreSQL Docker konteyneri ve Next.js dev sunucusu ayağa kaldırıldı.
- [x] **Yeni Logo Ayrıştırması & Tipografi Entegrasyonu:**
  - Bronz dümen amblemi izole edildi ve şeffaf arka planlı \public/rudder-helm-transparent.png\ olarak kaydedildi.
  - \udder\ kelime markası kod tarafında \Cinzel\ serif fontu ve bronz/altın rengiyle logodan bağımsız olarak yerleştirildi.
- [x] **Kullanıcı İsteklerine Birebir Uygun Tema & Dashboard Tasarımı:**
  - Ana sayfa arka planı temiz beyaz / aydınlık (\#f8fafc\) yapıldı.
  - Sol Sidebar: Kullanıcının 3. görselindeki derin bordo tonu (\#2e0911\) uygulandı; menü yazı ve ikonları kontrastlı saf beyaz (\#ffffff\) yapıldı.
  - Dashboard: Neon kalıntılardan arındırılmış, 4 dengeli korsan/dümen temalı metrik kartı (CPU, RAM, Disk, Sunucu Bilgisi) ve modern "Siteleriniz" alanı tasarlandı.
- [ ] **Özellik Eklemeleri & Çıkarmaları:** (Kullanıcı direktiflerine göre detaylandırılacak)
- [x] **Test & Doğrulama:** TypeScript typecheck (\
px tsc --noEmit\), 8 ana route (200 OK) test edildi.

---

## 📝 3. Yapılan Değişiklikler ve Doğrulama Kayıtları

| Tarih | İşlem / Değişiklik | Etkilenen Dosyalar | Doğrulama Durumu |
|---|---|---|---|
| 2026-09-02 | \1.1.0\ dalı oluşturuldu, yerel ortam ayağa kaldırıldı | Git branch, Docker, .env | Başarılı (200 OK) |
| 2026-09-02 | Logo ayrıştırma: Yalnızca saf bronz dümen sembolü + yanına kodla Cinzel 'rudder' kelimesi | \udder-logo.tsx\, \public/rudder-helm-transparent.png\ | Başarılı (TypeScript 0 hata, HTTP 200) |
| 2026-09-02 | Derin bordo sidebar (\#2e0911\) + saf beyaz menü metinleri ve ikonları | \pp-sidebar.tsx\ | Başarılı (TypeScript 0 hata, HTTP 200) |
| 2026-09-02 | Beyaz anasayfa arka planı + 4 dengeli korsan temalı metrik kartı | \globals.css\, \layout.tsx\, \page.tsx\ | Başarılı (TypeScript 0 hata, Tüm Rotalar 200 OK) |
