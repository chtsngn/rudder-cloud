# Denetim Düzeltmeleri — İlerleme ve Kararlar (2026-09-15, v1.3.0 ile yayınlandı)

Bu dosya, 2026-09-15 tarihli akış denetiminde (CloudPanel-tarzı "ters proxy → git clone →
.env → docker compose/pm2 → upstream portu" zinciri) bulunan eksiklerin düzeltme
ilerlemesini tutar. Oturumlar arasında kaldığı yerden devam etmek için buradaki
"Durum" tablosuna ve "Devam ederken" notlarına bak. Bittiğinde bu dosya silinebilir
ya da `docs/ARCHITECTURE.md`'ye özetlenebilir.

## Alınan kararlar (kullanıcı geri çevirebilir)

1. **DOCKER site tipi kaldırılmadı, tamamlandı.** Git bağlama, compose logları ve
   gerçek süreç kontrolleri eklendi; REVERSE_PROXY + "Docker Compose" yöneticisi de
   aynı motoru kullanıyor. Sihirbazda repo seçildiyse örnek compose/otomatik `up`
   atlanıyor (`skipDockerBootstrap`).
2. **Deploy hattı:** pull → (değişiklik varsa) `deployCommand` → yeniden başlatma.
   Docker Compose'da yeniden başlatma artık `docker compose up -d --build
   --remove-orphans` (kaynaktan build edilen image'lar da yenilenir); elle
   "restart" ayrıca duruyor.
3. **ProcessManager'a `NONE` eklendi**; REVERSE_PROXY varsayılanı `NONE`
   (migration mevcut SYSTEMD'deki proxy siteleri NONE'a çeker).
4. **PM2** artık `provision-site.sh pm2-action` üzerinden root'un pm2 daemon'ında
   çalışır; süreç adı `pm2ProcessName` alanıyla ayarlanır (boşsa domain slug'ı).
5. **GitHub Actions SSH anahtarı özelliği kaldırıldı** (`panel` kullanıcısı
   `nologin` olduğu için hiç çalışamıyordu). Yerine site başına **Deploy Hook**
   (tek kullanımlık gösterilen gizli URL, `POST /api/hooks/deploy/<token>`) ve
   **GitHub App push webhook'u** (`POST /api/hooks/github`) geldi. CI'da SSH yerine
   `curl -X POST <hook-url>` yeterli.
6. **Manuel repo adresi + SSH deploy key yolu geri getirildi** (GitLab/Bitbucket/
   public repo için). GitHub App bağlıyken manuel alan salt-okunur.
7. **STATIC/PHP/WordPress** siteleri artık diğer 4 tip gibi otomatik `site_<slug>`
   kullanıcısı alır (sihirbazda isteğe bağlı elle ad). Dosyalar bu kullanıcıya ait;
   panel ve nginx erişimi ACL ile; PHP/WordPress için site başına PHP-FPM havuzu
   (`user = site_x`). Eski root'a ait siteler için "Dedicated Kullanıcı Kur" butonu
   bu tiplerde de çalışıyor.
8. **Yürütme ayarları SUPER_ADMIN'e kilitlendi:** `processManager`,
   `customRestartCommand`, `deployCommand`, `pm2ProcessName`, port/başlatma
   komutu değişikliği. Sebep: `panel` kullanıcısının root kabuğa sudo'su var;
   panel olarak çalışan her komut fiilen root. EDIT_FILES'lı bir MEMBER özel
   betikle root'a çıkabiliyordu.
9. **Açık karar (yapılmadı):** Node/Python systemd birimlerinin `User=panel`
   yerine sitenin kendi kullanıcısıyla çalışması. Docker grubu/pm2 ile çakıştığı
   için ayrı bir tasarım kararı gerektiriyor; dokümanlar gerçeği ("panel olarak
   çalışır") yansıtacak şekilde düzeltildi.

## Durum

Aşama 1 — çekirdek akış ve hatalar (tamamlandı 2026-09-15)
- [x] Şema/migration: `NONE`, deploy alanları, deploy hook, actionsKey* kaldırma
- [x] provision-site.sh: docker bootstrap bayrağı, pm2-action, cleanup-site,
      refresh-cloudflare-ips, owned-site ACL + PHP-FPM havuzu, ensure-site-user modeli
- [x] provision.ts sarmalayıcıları, ölü docker-action/docker-logs temizliği
- [x] ports.ts (sayı/string port, upstream portu, çakışma kontrolü) + /api/system/ports
- [x] restart.ts: NONE, PM2 (root), compose rebuild/pull/logs/status
- [x] deploy.ts hattı; git.ts (DOCKER, ssh known_hosts); auto-pull scheduler
- [x] Deploy key geri getirme + actions key kaldırma (lib + route'lar)
- [x] Deploy hook + GitHub webhook (lib, route'lar, manifest `contents: read`)
- [x] dns-check.ts + SSL ön kontrolü (+ Cloudflare farkındalığı)
- [x] /api/sites POST (config beyaz listesi, port sayı, çakışma, auto linux user,
      NONE, DNS ön kontrolü) / PATCH (yeni alanlar, admin kilidi, port/komut
      değişikliği, denetim) / DELETE (temizlik seçenekleri)
- [x] github-connect, git-pull, deploy, docker-compose, docker-logs,
      process-status, dns-check, logs (yetki), repos (yetki), cloudflare-ips
- [x] middleware (/preferences), server.mjs (admin terminali site klasöründe)
- [x] UI: sihirbaz, site detay (süreç kartı, loglar, git sekmesi, deploy hook,
      deploy key, silme seçenekleri), site kartı, dashboard, ayarlar (webhook,
      Cloudflare), adapter
- [x] doctor.sh / install.sh (acl, docker kurulum teklifi, UMask, Cloudflare IP)
- [x] tsc / eslint / build + yerel API testleri
- [x] README / ARCHITECTURE güncellemesi

Aşama 2 — kalan "eksik" maddeler (tamamlandı 2026-09-15)
- [x] Container içindeki veritabanı için yedekleme (`docker compose exec` ile dump)
- [x] Node/Python siteler için gerçek bellek/CPU (systemd cgroup) göstergesi

## Sunucuda doğrulanacaklar (yerelde test edilemedi)

- `apply_owned_site_access` + `ensure_php_pool` (ACL, PHP-FPM havuzu, UMask drop-in)
  gerçek bir PHP/WordPress sitesinde: medya yükleme çalışıyor mu, dosya yöneticisi
  yazabiliyor mu, nginx okuyabiliyor mu.
- `cleanup-site` (compose down + klasör + kullanıcı silme) ve `pm2-action`
  (root'un pm2 daemon'ı, sudo `secure_path`'te pm2 var mı).
- `refresh-cloudflare-ips` (real_ip modülü) ve DNS ön kontrolünün gerçek IP tespiti
  (ipify erişimi).
- GitHub App: yeni App'te webhook otomatik geliyor mu; eski App'te elle secret.
- Eski siteler: Static/PHP/WordPress'te "Dedicated Kullanıcı Kur" (owned model).

## Devam ederken

- Yerel test düzeneği: geçici Postgres (`docker run ... postgres:16-alpine -p 5439`),
  `PATH` başına sahte `sudo`, `PROVISION_SCRIPT_PATH` sahte betik; bkz. bu oturumun
  scratchpad'i. Gerçek nginx/certbot/systemd yolları sunucuda test edilmeli.
- Çalışma ağacında ayrıca commit'lenmemiş "self-update" işi var (panel/scripts/
  self-update.sh vb.) — bu düzeltmelerden bağımsız.
