# Sunucu Yönetim Paneli — Mimari & Karar Dokümanı

Durum: Sihirbazın 3. adımı (gerçek provisioning) tamam ve build ile doğrulandı (2026-09-01). Kullanıcının istediği geniş özellik listesi aşağıda "Genişletilmiş Özellik Yol Haritası" bölümünde planlandı, aşamalı olarak geliştiriliyor.

## Amaç

CloudPanel tarzında, ondan daha gelişmiş bir sunucu yönetim paneli. Panel Nginx
üzerine kurulur; sitelerin kurulumunu, SSL'ini, sistem metriklerini ve (Node/Python
siteler için) process yönetimini tek bir arayüzden yapar.

## Seçilen Teknoloji Yığını

| Katman | Seçim | Not |
|---|---|---|
| Uygulama | **Next.js (App Router) — full-stack tek uygulama** | Ayrı bir Express/Fastify backend YOK: API, Route Handler'lar (`src/app/api/**`) ve gerekirse Server Actions ile Next.js içinde yaşıyor. Tek process, tek systemd servisi, tek deploy adımı. (Bkz. "2026-08-26 güncellemesi" altında gerekçe.) |
| UI kütüphanesi | shadcn/ui (style: `new-york`) + Tailwind v4 (CSS-first, `tailwind.config.js` yok) | Bileşenler `src/components/ui/` altında elle/CLI ile eklenir |
| Veritabanı | PostgreSQL (yerel, panelin kendi DB'si) | WordPress siteleri için ayrı MySQL/MariaDB kurulmaya devam eder — panel DB'si bundan bağımsız |
| ORM/Migration | Prisma (öneri, uygulama aşamasında netleşecek) | Tip güvenliği + migration yönetimi |
| Sistem metrikleri | `systeminformation` (npm) | CPU/RAM/Disk/Network; başlangıçta REST polling (~3-5 sn), ileride WebSocket/Server-Sent Events push |
| Site process yönetimi | systemd (her Node/Python site için ayrı `.service` birimi) | pm2 yerine systemd: zaten Ubuntu'da hazır, ekstra runtime gerektirmez |
| Reverse proxy / TLS | Nginx + Certbot (mevcut `scripts/site-wizard.sh` mantığı, apt bulamazsa `docs/certbot-kurulum.md` snap fallback) | |
| Panel'in kendi portu | **24428** | Nginx bu portta dinler ve tüm trafiği (sayfalar + `/api`) arka plandaki Next.js sürecine (127.0.0.1:<internal_port>, `next start`) proxy'ler |

### 2026-08-26 güncellemesi: Next.js + shadcn/ui kararı

Kullanıcı isteğiyle frontend "Shadcn + Next.js" olarak belirlendi. Bunun doğal sonucu
olarak backend de Next.js'in Route Handler'larına taşındı (ayrı bir Express süreci
yerine) — sebep: shadcn zaten Next.js'e entegre çalışıyor, tek Node process'i
deploy/systemd/log yönetimini basitleştiriyor. Bu, önceki "Node.js (Express) backend +
React SPA frontend" planının yerini alır. `backend/` ve `frontend/` klasörleri bu
yüzden boş/kullanılmıyor — gerçek uygulama `panel/` altında.

İskelet kuruldu: `panel/` (Next.js 16, React 19, Tailwind v4, TypeScript). shadcn/ui
bileşenleri (`button, card, input, label, badge, switch, avatar, separator, progress,
dropdown-menu, tabs`) elle yazıldı çünkü **bu oturumun sandbox ağı `ui.shadcn.com`'u
engelliyor** (403) — bu sadece Claude'un bu oturumdaki ağ kısıtı, kullanıcının kendi
bilgisayarında `npx shadcn@latest add <bileşen>` normal şekilde çalışır;
`components.json` bu yüzden doğru bırakıldı. Google Fonts (Manrope/Public Sans/
JetBrains Mono) de aynı sebeple bu oturumda doğrulanamadı — `layout.tsx` içinde
sistem fontlarına düşen bir yorum bırakıldı, gerçek fontlara geçiş tek satırlık.

Mock veriyle çalışan sayfalar: `/login`, `/(dashboard)` (istatistik kartları + site
kartları + YENİ butonu), `/(dashboard)/sites/new` (1. adım tip seçimi + 2. adım
temsili form), `/(dashboard)/sites/[id]` (Node.js process yönetimi örneği). Henüz
backend/DB bağlı değil.

**Önemli operasyonel not (çözüldü):** Next.js'in `.next` derleme önbelleğini
(özellikle Turbopack) her build'de silip yeniden yazması gerekiyor. Bu proje
klasörü Claude'un cihaz köprüsü üzerinden bağlı olduğu için dosya silme izni
istendi ama pratikte kesin onay alınamadı; bu yüzden şu çalışma deseni benimsendi:
Claude, `npm install`/`npm run build` gibi silme gerektiren işleri cihazın kendi
$HOME'u altında (bağlı klasörün DIŞINDA, örn. `~/panel-dev`) yapar — orada tam
silme izni var — sonra doğrulanmış kaynak dosyaları (node_modules ve .next HARİÇ)
`rsync` ile bağlı klasördeki `panel/`'e geri kopyalar (üzerine yazma, silme
gerektirmez). Kullanıcının kendi Terminal'inde çalıştırdığı `npm install`/`npm run
build` bu kısıttan etkilenmez — kısıt yalnızca Claude'un bu oturumdaki cihaz
köprüsü erişimine özgü. `npm run build` bu şekilde doğrulandı: 6 route de
(`/`, `/login`, `/settings`, `/sites/new`, `/sites/[id]`, `/_not-found`) temiz
derleniyor, TypeScript ve ESLint hatasız.

### 2026-08-27/28 güncellemesi: Backend (Prisma, auth, API'ler) tamamlandı ve doğrulandı

`panel/` içine gerçek backend eklendi: `prisma/schema.prisma` (User/Site modelleri),
bcryptjs+jose tabanlı oturum yönetimi (`src/lib/auth.ts`, `src/lib/session.ts`,
edge-safe `src/middleware.ts`), `/api/auth/{login,logout}`, `/api/sites` (+`[id]`),
`/api/system/stats` (`systeminformation`). Dashboard artık mock veri değil bu
API'lere bağlı (5sn polling). `create-admin.mjs` betiği `install.sh`'ın ürettiği
`ADMIN_USERNAME`/`ADMIN_PASSWORD` ortam değişkenleriyle çalışıyor.

**Bu oturuma özgü ek bir sandbox kısıtı bulundu ve doğrulandı:** `binaries.prisma.sh`
(Prisma'nın motor indirme CDN'i) bu oturumun ağ izin listesinde tamamen engelli
(403) — hatta `prisma --version` bile başarısız oluyor. `package.json`'a eklenen
`postinstall: prisma generate` bu yüzden bu sandbox'ta `npm install`'un kendisini
de düşürüyor. **Kullanıcının gerçek sunucusunu etkilemez** — sıradan bir HTTPS
erişimi (npmjs.org'a erişim kadar temel) yeterli. Claude'un kendi build
doğrulamasını yapabilmesi için `~/panel-dev` üzerinde yalnızca tip bilgisi taşıyan,
gerçek DB'ye asla bağlanmayan geçici bir Prisma client stub'ı kullanıldı — bu
stub bağlı proje klasörüne hiç kopyalanmadı, sadece geçici doğrulama kopyasında var.

**Ayrıca öğrenildi — bu sandbox'ta npm indirmeleri sessizce bozulabiliyor:**
45 saniyelik komut zaman aşımı bir `npm install`'u yarıda kestiğinde, npm bunu
her zaman hata olarak raporlamıyor; bazı paketler (özellikle `@next/swc-linux-arm64-*`
gibi büyük native `.node` dosyaları ve `lucide-react`) eksik/küçük boyutlu kalabiliyor
(`.d.ts` dosyaları hiç gelmemiş, native binary gerçek boyutunun çok altında — "Bus
error" ile kendini gösteriyor). Belirti fark edilirse çözüm: `npm cache clean --force`
+ ilgili paketi/`node_modules`'ı silip yeniden `npm install`. `npm run build` bu
şekilde temiz doğrulandı: 11 route, TypeScript ve ESLint hatasız derleniyor.
(Küçük, engelleyici olmayan bir not: Next.js 16.3.3 `middleware.ts` yerine `proxy.ts`
adlandırmasını öneriyor — deprecation warning var ama build'i bozmuyor, ileride
`npx @next/codemod@canary middleware-to-proxy .` ile taşınabilir.)

## Kurulum Akışı

### 1) `doctor.sh` — gereksinim kontrolü ve kurulumu
- Root değilse: kullanıcıya "bu işlem root yetkisi gerektiriyor" diye açıkça sorar, onay alırsa `exec sudo -E bash "$0" "$@"` ile kendini yeniden başlatır.
- OS/distro tespiti (Ubuntu/Debian varsayımı — mevcut scriptler apt/snap tabanlı).
- Kontrol edilecekler: `nginx`, `node`+`npm` (gerekli sürüm), `postgresql` (server+client), `git`, `curl`, `rsync`, `unzip`, `certbot`+`python3-certbot-nginx` (yoksa snap fallback), `systemd` (zaten var).
- Eksik olanları listeler, kuruluma onay ister (`--yes` bayrağıyla otomatik de çalışabilir), kurar.
- Panel için sistem kullanıcısı, dizinler (`/opt/sunucu-paneli` gibi) ve PostgreSQL rol/DB'sini oluşturur.
- Hata durumunda net, renkli çıktı ile hangi adımın başarısız olduğunu gösterir (mevcut scriptlerdeki `msg/warn/die` deseniyle tutarlı).

### 2) `install.sh` — orkestrasyon
1. `doctor.sh`'ı çalıştırır.
2. Panel kodunu (`panel/`) hedef dizine yerleştirir, `npm install` + `npm run build` çalıştırır.
3. `.env` dosyasını oluşturur (DB bağlantısı, JWT/secret, internal port vb.).
4. DB migration'larını çalıştırır (Prisma migrate).
5. **Super admin** kullanıcısını oluşturur: güvenli rastgele şifre üretir, bcrypt ile hash'ler, DB'ye yazar; şifreyi bir kere ekrana basar ve `/root/.panel-credentials` (chmod 600) dosyasına da yazar.
6. Panel için Nginx vhost'unu yazar: `listen 24428;`, tüm trafiği `127.0.0.1:<internal_port>`'a (`next start`) proxy'ler.
7. Next.js için systemd servisi (`panel.service`, `next start`) oluşturur, `enable --now` ile başlatır.
8. Nginx'i reload eder, kurulum özetini (panel URL'i + super admin bilgileri) ekrana basar.

### 3) İlk giriş
Tarayıcıdan `http://<sunucu-ip>:24428` açılır → sadece login ekranı gösterilir → super admin bilgileriyle giriş yapılır (ileride şifre değiştirme zorunlu kılınabilir).

## Arayüz (Dashboard)

- **Üst bölüm:** sunucu durumu — RAM, CPU, Disk (ve muhtemelen network) canlı göstergeler.
- **Alt bölüm:** siteler kart kart listelenir (domain, tip ikonu, durum — çalışıyor/durdu/SSL var-yok).
- **YENİ butonu:** site kurulum sihirbazını açar.

## Site Kurulum Sihirbazı (6 tip)

Mevcut `scripts/site-wizard.sh`'daki interaktif adımların birebir web formuna taşınmış hali —
"bütün aşamalar arayüzden seçilebilir olacak" gereksinimine göre her prompt bir form alanına karşılık gelir:

| Tip | Ortak alanlar | Tipe özel alanlar |
|---|---|---|
| WordPress | domain, www ekle, SSL+e-posta | PHP sürümü, site root, linux user, DB adı/kullanıcı/şifre |
| PHP | domain, www, SSL+e-posta | PHP sürümü, site root, linux user |
| Node.js | domain, www, SSL+e-posta | port, servis adı, **başlatma komutu** (örn. `npm start`) |
| Static | domain, www, SSL+e-posta | site root, linux user |
| Python | domain, www, SSL+e-posta | port, linux user, **başlatma komutu** (örn. `gunicorn app:app --bind 127.0.0.1:$PORT`) |
| Reverse Proxy | domain, www, SSL+e-posta | upstream URL |

Sihirbaz akışı: (1) tip seçimi → (2) forma özel alanlar → (3) özet/onay → (4) canlı kurulum
logu (nginx yaz, gerekiyorsa DB/WP indirme, gerekiyorsa systemd servis oluşturma, gerekiyorsa
certbot) → (5) başarı ekranı + site URL'i. Şu an `panel/` içinde 1. ve 2. adım mock
veriyle var; 3. adım (gerçek provisioning) henüz yok.

## Node.js / Python Siteler için Process Yönetimi (genişletilmiş kapsam)

Orijinal bash script sadece Nginx reverse-proxy kurup uygulamanın kendisini kullanıcıya
bırakıyordu. Panelde bu genişletildi:
- Her Node/Python site için otomatik bir systemd birimi (`site-<slug>.service`) oluşturulur,
  site'ın kendi linux kullanıcısı altında çalışır.
- Arayüzden start/stop/restart yapılabilir.
- Çökme sonrası otomatik yeniden başlatma (`Restart=on-failure`) tanımlanır.
- Loglar `journalctl -u site-<slug>.service` üzerinden arayüzde görüntülenebilir (canlı tail için WS/SSE).

## Güvenlik Notları

- **Karar (2026-08-28, önceki taslağın yerine geçer):** Panel süreci ROOT OLARAK
  ÇALIŞMIYOR — `doctor.sh`'ın oluşturduğu unprivileged, nologin `panel` sistem
  kullanıcısı altında (`panel.service`'te `User=panel`). Ayrıcalık ayrımı MVP'nin
  bir parçası, sonraya bırakılmadı: nginx/systemd/certbot gibi kök yetkisi
  gerektiren TÜM işlemler, `panel` kullanıcısına `sudoers.d` ile sadece TEK bir
  betiği (`/opt/sunucu-paneli/scripts/provision-site.sh`) şifresiz çalıştırma
  izni verilerek yapılır — başka hiçbir komuta genel `sudo` izni yok. Next.js API
  route'ları bu betiği `child_process.execFile("sudo", [...])` ile (shell
  yorumlaması olmadan, argümanlar dizi olarak) çağırır. Betiğin kendisi domain/
  port/tip gibi tüm girdileri sıkı doğrular (örn. domain için `^[a-z0-9.-]+$`).
- Girdi doğrulama (özellikle domain/port/komut alanlarında shell injection'a karşı)
  hem API katmanında hem de `provision-site.sh` içinde ayrı ayrı yapılır (savunma
  derinliği).


### 2026-09-01 güncellemesi: Sihirbaz adım 3 (gerçek provisioning) tamamlandı ve doğrulandı

`panel/scripts/provision-site.sh` (549+ satır) yazıldı: `create-vhost` (6 tipin hepsi),
`remove-vhost`, `request-ssl`, `create-service`/`remove-service`/`service-action`/
`service-status`/`service-logs` (systemd), `create-wp-db` (MySQL/MariaDB). Her girdi
kendi regex'iyle bağımsız doğrulanıyor (domain, port, php sürümü, site kökü `/var/www/`
altında olmalı + `..` içeremez, db kimlikleri/şifresi, systemd birim adı). `doctor.sh`'a
MySQL/MariaDB VE PHP-FPM (8.3/8.2, gerekirse ondrej/php PPA ile) kontrol+kurulum adımları
ve `/etc/sudoers.d/panel-provisioning` (yalnızca bu TEK betiğe, `visudo -c` ile
doğrulanarak) sudoers izni eklendi. Next.js tarafında `src/lib/provision.ts`
(`execFile("sudo", [...])`, hiçbir shell interpolasyonu yok) + `/api/sites` (POST artık
gerçekten provision ediyor, DELETE gerçekten temizliyor), `/api/sites/[id]/action`
(start/stop/restart), `/api/sites/[id]/logs` (journalctl) eklendi. Sihirbazın 2. adımı
gerçek alanlarla dolduruldu, 3. adım sonuç ekranı eklendi; site detay sayfasındaki
process kontrolleri gerçek endpoint'lere bağlandı.

Doğrulama sırasında (kod incelemesi + `~/panel-dev` üzerinden `tsc`+`eslint`+
`npm run build`) bulunup düzeltilen gerçek eksikler: (1) `doctor.sh`'ta PHP-FPM
kurulum adımı eksikti — PHP/WordPress siteleri her zaman "soket bulunamadı" hatasıyla
başarısız olurdu, eklendi; (2) WordPress DB şifresi, DB satırı ilk oluşturulurken
kısa süreliğine düz metin olarak `config`'e yazılıyordu (süreç provisioning
ortasında çökerse kalıcı olarak öyle kalabilirdi) — artık satır ilk oluşturulurken
bile şifre hiç yazılmıyor; (3) reverse-proxy upstream URL doğrulaması TS tarafında
bash'teki kadar sıkı değildi — eşitlendi; (4) nginx test çıktısı için `/tmp` içinde
tahmin edilebilir dosya adı kullanılıyordu — `mktemp`'e çevrildi. Build: 13 route,
`tsc`/`eslint` hatasız.

### 2026-09-01 güncellemesi: Kritik eksik — hiç Prisma migration'ı yoktu, düzeltildi

Aşama B'ye başlarken fark edildi: repoda `prisma/migrations/` klasörü HİÇ
yoktu — yani `install.sh`'ın çalıştırdığı `prisma migrate deploy` gerçek bir
sunucuda sessizce hiçbir şey yapmayan bir no-op olurdu ve veritabanı şeması
asla oluşmazdı. Kök neden: bu sandbox'ta `binaries.prisma.sh` engelli
(hem `device_bash` hem bulut konteynerinden doğrudan `curl` ile doğrulandı —
`403`), yani `prisma migrate dev` bu ortamda hiçbir zaman gerçekten
çalıştırılamamış. Düzeltme: `prisma/migrations/migration_lock.toml` ve
`prisma/migrations/20260901000000_init/migration.sql` elle yazıldı (tüm enum'lar,
`User`/`Site` tabloları, unique index'ler) ve bulut konteynerinde gerçek bir
PostgreSQL 16 örneğine (`psql -v ON_ERROR_STOP=1 -f migration.sql`) uygulanıp
`\d` ile sütun tipleri/varsayılanları/null durumu doğrulandı — yalnızca
"derlenir" değil, gerçekten çalıştığı kanıtlandı. Bu dosya artık şemanın tek
kaynağı; `prisma/schema.prisma`'ya yeni alan eklenen her aşamada (Aşama B'nin
git/restart alanları dahil) bu migration dosyası da elle güncel tutulmalı —
gerçek `prisma migrate dev` bu ortamda çalışana kadar bu disiplin sürmeli.

## Genişletilmiş Özellik Yol Haritası (2026-09-01, kullanıcı isteğiyle eklendi)

Kullanıcı, panelde ayrıca şu özelliklerin de olmasını istedi. Kapsam büyük olduğu için
aşamalı geliştiriliyor; her madde için aşağıda somut bir mimari karar var (sonra "nasıl
yapalım" diye tekrar düşünmemek için). Aşama sırası, bağımlılıklara göre:

**Aşama A — Port görüntüleyici** ✅ TAMAMLANDI (2026-09-01):
`GET /api/system/ports` — root gerektirmeyen `ss -tlnp` (izin yoksa `ss -tln`'e
düşer) ile sistemdeki tüm dinleyen TCP portlarını listeler, kendi `Site`
tablomuzdaki portlarla eşleştirip "bu portu şu site kullanıyor" etiketler, docker
varsa `docker ps` ile container portlarını da ekler, 3000-9000 aralığında boş port
önerir. Yeni `/ports` sayfası (sidebar'a eklendi, middleware matcher'ına eklendi —
auth arkasında). `npm run build`/`tsc`/`eslint` ile doğrulandı (14 route).

**Aşama B — Git pull + proje restart (şema temeli + izin yardımcısının başlangıcı)**
✅ TAMAMLANDI (2026-09-01): `Site` modeline eklendi: `repoUrl`, `gitBranch`
(varsayılan `main`), `autoPullEnabled`, `autoPullIntervalSeconds` (varsayılan 15),
`lastPullAt`/`lastPullOk`/`lastPullError`, `processManager` (`SYSTEMD` |
`DOCKER_COMPOSE` | `PM2` | `CUSTOM_SCRIPT`, varsayılan `SYSTEMD`),
`customRestartCommand` — hem `prisma/schema.prisma` hem de elle yazılan
`prisma/migrations/20260901000000_init/migration.sql` içinde (bkz. aşağıdaki
"Prisma migration'ları" notu). Git işlemleri `panel` kullanıcısı olarak, hiçbir
sudo olmadan çalışır (`src/lib/git.ts`) — bu yüzden kasıtlı olarak SADECE
NODEJS/PYTHON tiplerinde destekleniyor (`isGitPullSupported`); STATIC/PHP/
WORDPRESS dedicated bir linux user kullanabildiği için kapsam dışı bırakıldı.
`.git` varsa `git fetch` + `reset --hard origin/<branch>`, yoksa geçici dizine
`git clone` edip `rsync -a` ile hedefe (var olan dosyaları silmeden) taşıma.
Pull öncesi/sonrası `git rev-parse HEAD` karşılaştırılıp gerçekten değişiklik
olup olmadığı (`GitPullResult.changed`) döndürülüyor — restart yalnızca HEAD
değiştiyse tetikleniyor. Restart dispatch'i `src/lib/restart.ts`:
SYSTEMD → mevcut systemd `serviceAction`; DOCKER_COMPOSE → `docker compose
restart` (workdir'de); PM2 → `pm2 restart <slug>`; CUSTOM_SCRIPT → mutlak yolun
site dizini İÇİNDE olduğu + çalıştırılabilir bit kontrolü (içerik doğrulanmaz —
CloudPanel'deki "özel deploy script'i" mantığı). `POST /api/sites/[id]/action`
artık `restart` için tüm processManager'ları `restartSite()` ile kapsıyor;
`start`/`stop` yalnızca SYSTEMD'de anlamlı olduğundan diğerlerinde açık Türkçe
hata döndürüyor. `PATCH /api/sites/[id]` yeni alanları doğrulayıp güncelliyor.
`POST /api/sites/[id]/git-pull` manuel tetikleme; başarı/hata `lastPullAt/Ok/Error`
olarak kaydediliyor, restart hatası ayrı `restartError` alanıyla (pull'un kendisini
başarısız SAYMIYOR). Otomatik pull: gerçek bir cron/systemd-timer DEĞİL,
`src/lib/auto-pull-scheduler.ts` — panel süreci içi 5sn'lik reconciliation loop,
her site kendi `autoPullIntervalSeconds`'ına göre (site başına son deneme zamanı
+ aynı anda tekrar tetiklenmeyi önleyen bir `inFlight` seti ile) taze tutuluyor;
`src/instrumentation.ts`'in `register()` kancasıyla (yalnızca nodejs runtime'da)
sunucu ilk ayağa kalktığında bir kez başlatılıyor. `src/lib/permissions.ts`:
Aşama G'nin `canManageSite(userId, site, permission)` iskeleti burada atıldı —
şimdilik her zaman `true` dönüyor (gerçek RBAC Aşama G'de), ama yeni route'lar
(action/git-pull/PATCH) baştan bu kontrolden geçiyor. `doctor.sh`'a: (1) `panel`
kullanıcısını `docker` grubuna ekleme adımı — kök-eşdeğeri bir yetki olduğu için
`--yes` ile dahi otomatik onaylanmıyor, HER ZAMAN ayrıca sorulur; (2) PM2 varlık
tespiti (yalnızca bilgilendirme, panel PM2'yi otomatik KURMAZ). Site detay
sayfasına "Git & Dağıtım" kartı: repo/branch alanları, otomatik-pull anahtarı +
aralık, yeniden başlatma yöntemi seçici + özel komut alanı, "Şimdi Pull Et"
butonu, son pull durumu/zamanı. `$HOME/panel-dev` akışıyla (npm install, elle
yazılan Prisma stub'ının yeniden oluşturulması, `npx next typegen` + `tsc
--noEmit` + `eslint .` + `npm run build`) uçtan uca doğrulandı (15 route,
0 tip hatası, 0 lint hatası — yalnızca `permissions.ts`'in kasıtlı olarak
kullanılmayan placeholder parametreleri için 3 uyarı).

**Aşama C — Dosya yöneticisi + .env yönetimi + Monaco editör** ✅ TAMAMLANDI
(2026-09-01, en büyük arayüz yüzeyi): Her zaman TEK bir site'ın kendi dizinine
kapsanır — `resolveSiteWorkdir` (Aşama B'de zaten vardı) burada da kök olarak
kullanılıyor, yani STATIC/PHP/WORDPRESS/NODEJS/PYTHON hepsi destekleniyor
(yalnızca REVERSE_PROXY'nin yerel dosyası olmadığı için kapsam dışı). Paylaşılan
`src/lib/site-fs.ts` — `resolveSitePath()` her işlemde ÖNCE string/`..`
düzeyinde (normalize + prefix kontrolü), SONRA `fs.realpath` ile her ata dizini
(ve hedefin kendisi bir symlink'se onu da) site kökü İÇİNDE mi diye doğruluyor;
bu iki katmanlı kontrol elle satır satır izlenerek (traversal, sembolik link
ile kaçış, henüz var olmayan hedef yolu, boş/kök yol gibi uç durumlar) gözden
geçirildi. Klasör oluştur/sil (`createFolder`/`deleteEntry`, özyinelemeli),
dosya oluştur/sil/yükle/indir, çoklu seçimde/klasörde otomatik zip (`archiver`,
`createZipStream` ile BELLEĞE ALMADAN akış halinde — Aşama B'deki gibi yeni bir
native olmayan bağımlılık), şablonlu dosya oluşturma (`src/lib/file-templates.ts`:
.html/.js/.jsx/.ts/.tsx/.py/.json/.css/.md). Metin dosyaları için 5MB, yükleme
için 200MB üst sınır (`site-fs.ts`); panelin kendi nginx vhost'unun
`client_max_body_size`'ı da bununla eşleşecek şekilde 20m'den 200m'ye
yükseltildi (`install.sh`) — bu eşleşme olmadan büyük yüklemeler sessizce 413
ile nginx'te takılırdı. `.env` yönetimi (`src/lib/site-env.ts`) site kökünün
YALNIZCA birinci seviyesini tarar, `.env*` dosyalarını listeler, `.env` yoksa
`.env.example`/`.env.sample`'dan `COPYFILE_EXCL` ile (var olanın üzerine ASLA
yazmadan) tek tuşla kopyalar. Yeni route'lar: `GET/POST/DELETE
/api/sites/[id]/files`, `GET/PUT .../files/content`, `POST .../files/upload`,
`GET .../files/download`, `GET /api/sites/[id]/env`, `POST .../env/copy` —
hepsi `canManageSite` üzerinden (VIEW/EDIT_FILES/DELETE) geçiyor. Arayüz:
`/sites/[id]/files` (breadcrumb gezinme, çoklu seçim, yükle/oluştur/sil/indir,
üstte `.env` kartı) + `/sites/[id]/files/edit?path=` (Monaco, `@monaco-editor/
react` — varsayılan CDN yükleyicisiyle, TARAYICI tarafında jsdelivr'den çekiliyor;
bu sunucu tarafı ağ kısıtlarından bağımsız ama yöneticinin tarayıcısının
internete çıkabilmesini gerektiriyor, bilinçli bir tercih). Dedicated-linux-user
ile provision edilmiş STATIC/PHP/WORDPRESS sitelerinde panelin yazma izni
olmayabileceği (Aşama B'deki git-pull kısıtıyla aynı köken) bilinen bir sınır —
sessizce yutulmuyor, `EACCES/EPERM` net bir Türkçe hataya çevriliyor.
`$HOME/panel-dev` akışıyla doğrulandı (23 route, 0 tip/lint hatası — doğrulama
sırasında dosya editör sayfasında bir `set-state-in-effect` hatası ve dosya
yöneticisi sayfasında kullanılmayan bir `cancelled` bayrağı/fonksiyon bulunup
düzeltildi).

**Aşama D — Ayarlar ekranı (AWS/S3) + veritabanı yedekleme** ✅ TAMAMLANDI
(2026-09-01): Yeni `S3Config` tablosu (panel genelinde, site-scoped DEĞİL —
birden fazla site aynı config'i paylaşabilir) — `secretAccessKeyEnc` AES-256-GCM
ile şifreli (`src/lib/crypto.ts`, anahtar `SETTINGS_ENCRYPTION_KEY`'den `scrypt`
ile türetiliyor), API yanıtlarında ASLA dönmez (`hasSecret: true` yeterli).
`install.sh` artık `SETTINGS_ENCRYPTION_KEY`'i de `openssl rand -base64 32` ile
üretiyor (fresh install VE var olan `.env`'e sonradan idempotent ekleme — ikisi
de kapsandı). `BackupSchedule` gibi ayrı bir tablo yerine Aşama B'nin autoPull*
desenini birebir tekrarlayan alanlar doğrudan `Site`'a eklendi
(backupEnabled/backupIntervalSeconds/backupRetentionCount/backupUploadToS3/
s3ConfigId/lastBackup*) — her sitenin tek bir zamanlaması olacağı için ayrı
tabloya gerek görülmedi, bilinçli bir sadeleştirme. Veritabanı algılama
(`src/lib/db-detect.ts`): sitenin `.env`/`.env.production`/`.env.local`
dosyalarında `DATABASE_URL` (URL şemasından motor çıkarımı), Laravel-tarzı
`DB_CONNECTION`+`DB_*`, `MONGO_URI`/`MONGODB_URI` desenlerini dener; HİÇBİRİ
yoksa WORDPRESS siteleri için `wp-config.php`'deki `define('DB_NAME', ...)`
sabitlerini parse eder (WordPress kimlik bilgilerini `.env` DEĞİL doğrudan PHP
sabitleriyle tuttuğu için bu ayrı yol şart — yoksa panelin en yaygın site tipi
kapsam dışı kalırdı). Emin olamadığında `null` döner, YANLIŞ TAHMİN ETMEZ.
Yedekleme (`src/lib/backup.ts`): `pg_dump`/`mysqldump` çıktısı `node:zlib`
`createGzip()` ile akış halinde doğrudan dosyaya yazılıyor (bellekte
tutmadan), şifreler `PGPASSWORD`/`MYSQL_PWD` ortam değişkenleriyle geçiriliyor
(`ps aux`'ta ifşa olmasın diye, komut argümanı OLARAK değil); `mongodump`
kendi `--gzip --archive=` bayraklarıyla doğrudan dosyaya yazıyor. Dosyalar
`/opt/sunucu-paneli/backups/<domain>/` altında (panel kullanıcısı zaten sahibi
— sudo GEREKMEZ), retention DB'de değil dosya sistemini tarayarak uygulanıyor
(`applyRetention` — en yeni N dosya kalır). S3 yükleme (`src/lib/s3-upload.ts`,
`@aws-sdk/client-s3`) isteğe bağlı, başarısız olsa bile yedeğin kendisini
başarısız SAYMIYOR (ayrı `s3Error` alanı). Periyodik zamanlama:
`src/lib/backup-scheduler.ts` — Aşama B'nin `auto-pull-scheduler.ts`'iyle
BİREBİR aynı reconciliation-loop deseni (gerçek cron DEĞİL), `instrumentation.ts`
ikisini de başlatıyor. Doğrulama sırasında iki gerçek sorun bulunup düzeltildi:
(1) yeni `/api/settings/*` route'ları middleware'in auth matcher'ına EKLENMEMİŞTİ
— yani S3 kimlik bilgisi yönetimi oturumsuz erişilebilir olurdu, `src/middleware.ts`
matcher'ına eklendi; (2) `GET /api/sites/[id]/backup` algılanan veritabanı
bilgisini İSTEMCİYE OLDUĞU GİBİ dönüyordu — `user`/`password`/`connectionUri`
(yani ham DB şifresi) tarayıcıya sızıyordu, `toPublicDetected()` ile yalnızca
motor/host/port/db-adı/kaynak alanlarına indirgendi. Ayrıca build sırasında
Turbopack'in dinamik (env değişkenine bağlı) dosya yolu erişimini "tüm projeyi
izlemeye" çalışması uyarısı çıktı — `backupDirForDomain`'deki `path.join`
çağrısına `/* turbopackIgnore: true */` eklenerek (tek noktadan, tüm alt
kullanımları da kapsayacak şekilde) temizlendi. `$HOME/panel-dev` akışıyla
doğrulandı (29 route, 0 tip/lint/build hatası/uyarısı).

**Aşama E — GitHub deploy key / Actions key yönetimi — ✅ TAMAMLANDI (2026-09-01)**:
Mevcut `scripts/github-deploy-key.sh` / `github-actions-key.sh` interaktif olduğu
için DOĞRUDAN sarmalanmadı — mantıkları (`src/lib/github-keys.ts`) API olarak
yeniden yazıldı:

- **Deploy key** (git clone/pull, salt-okunur): `panel` kullanıcısının kendi
  `~/.ssh` dizininde ed25519 anahtar üretilir (`site_<slug>_deploy`,
  `slugifyDomain()` ile alan adından türetilir), `~/.ssh/config`'e idempotent bir
  `Host github.com-site_<slug>_deploy` alias'ı eklenir (script'in kendi Host alias
  adımının birebir karşılığı — yalnızca panelin ürettiği bloğu tanıyıp kaldıran bir
  `removeHostAlias()` ile temiz silme de var). Public key GitHub'ın Deploy Keys
  ayarına elle eklensin diye gösterilir; `ssh -T git@<alias>` ile bağlantı testi de
  yapılabiliyor (GitHub başarılı auth'ta bile exit 1 döndüğü için sonuç çıktıdaki
  "successfully authenticated" ifadesinden çıkarılıyor).
- **Actions key** (GitHub Actions → sunucuya SSH): ayrı bir ed25519 anahtar
  üretilir, public key `panel` kullanıcısının KENDİ `authorized_keys`'ine eklenir.
  `gh` CLI sunucuda kurulu VE authenticate edilmişse secret otomatik eklenmeye
  çalışılır (opsiyonel — script'in "gh CLI bulundu, otomatik ekleyeyim mi?"
  adımının karşılığı); değilse veya `gh` ile ekleme başarısız olursa private key
  API yanıtında BİR KEZ döner, panel kullanıcıya "GitHub secret'ına elle yapıştır"
  diye gösterir ve bir daha hiçbir route'tan okunamaz.
- Her ikisi de `panel` kullanıcısının zaten sahip olduğu kendi ev dizini
  (`~/.ssh`) içinde çalıştığı için YENİ BİR SUDO İZNİ GEREKTİRMEDİ.
- **Kritik güvenlik kararı**: private key hiçbir zaman veritabanına yazılmıyor —
  yalnızca diskte 0600 izinle duruyor. `Site` tablosuna eklenen 8 alan
  (`deployKey*`/`actionsKey*`) yalnızca PUBLIC bilgiyi (anahtar adı, public key,
  parmak izi, oluşturulma tarihi) önbelleğe alıyor. `GET /api/sites/[id]/actions-key`
  bilinçli olarak `privateKey` alanını asla döndürmüyor — yalnızca üretim anındaki
  `POST` yanıtı bir kez döner, ve `gh` ile otomatik ekleme başarılı olduysa O DA
  yanıttan çıkarılıyor (gereksiz maruziyeti azaltmak için).
- Kendi kendine yapılan güvenlik incelemesinde gerçek bir sorun bulundu: anahtar
  üretimindeki `ssh-keygen` çağrısına `timeout` KONULMAMIŞTI — aynı siteye art arda
  iki üretim isteği (ör. çift tıklama) arasında teorik bir yarış durumunda
  `ssh-keygen` dosya zaten varken interaktif "Overwrite?" promptuyla karşılaşıp
  isteği süresiz askıda bırakabilirdi; script kendisi interaktif çalıştığı için bu
  riski taşımıyordu ama API'de taşıyordu. `{ timeout: 15_000 }` eklenerek
  sınırlı, açık bir hataya çevrildi.
- `Site`'a yeni migration: `20260901020000_github_keys` — gerçek Postgres 16'ya
  init + backup_s3 + github_keys sırasıyla uygulanarak doğrulandı.
- `$HOME/panel-dev` akışıyla doğrulandı (32 route, 0 tip/lint/build hatası/uyarısı).
  Ayrıca yerleşik `permissions.ts`'teki önceden var olan (bu aşamadan bağımsız) 3
  ESLint uyarısı da bu vesileyle temizlendi.

**Aşama F — Sunucu terminali — ✅ TAMAMLANDI (2026-09-01)**: xterm.js
(`@xterm/xterm` + `@xterm/addon-fit`) + `node-pty` (gerçek PTY), özel bir
`panel/server.mjs` üzerinden — plain `next start`/`next build` WebSocket upgrade'ini
desteklemediği için Next.js'in resmi "custom server" deseni kullanıldı (bkz.
https://nextjs.org/docs/app/guides/custom-server). Tasarım:

- `server.mjs` kendi `http.Server`'ını kurup `next({ dev, httpServer, port })`'a
  veriyor — `httpServer` seçeneği KASITLI: Next'in kendi ihtiyaçları (özellikle dev
  modunda HMR websocket'i) aynı server nesnesine bağlanabilsin diye. Kendi
  `upgrade` dinleyicimiz yalnızca `/api/terminal/socket` ile eşleşen istekleri
  işliyor, eşleşmeyenlere DOKUNMUYOR.
- `install.sh`/`panel.service` DEĞİŞMEDİ: `ExecStart=npm run start` zaten
  `package.json`'daki `start` script'ine devrediyor, o da artık
  `NODE_ENV=production node server.mjs` (resmi dokümantasyonun önerdiği tam
  kalıp — `NODE_ENV` `.env`'de YOKTU, bu yüzden script içinde açıkça set
  edilmesi ŞART, yoksa custom server sessizce dev moduna düşerdi).
- `server.mjs` Next.js/TypeScript derleme zincirinden GEÇMİYOR (resmi dokümantasyon
  notu) — bu yüzden `src/lib/session.ts`'teki oturum doğrulama mantığının bir alt
  kümesi (cookie adı, JWT doğrulama) KASITLI olarak orada tekrar edildi
  (`scripts/create-admin.mjs`'in zaten kullandığı "derlemesiz .mjs" deseniyle
  aynı). WS upgrade isteği middleware'den GEÇMEZ (Next'in router'ına hiç
  girmiyor) — bu yüzden kimlik doğrulaması `server.mjs` içinde elle yapılıyor,
  kimliksiz istek `401` ile reddediliyor.
- **Karar:** terminal `panel` kullanıcısının kendi kabuğunu açar (root DEĞİL) —
  panel zaten yalnızca `provision-site.sh` üzerinden sudo'ya sahip, terminal de
  aynı sınırlı yetkiyle çalışır; tam root terminali için ayrı, saklı kimlik
  bilgileri gerektiren bir SSH-dışa-bağlanma yaklaşımı KASITLI olarak tercih
  edilmedi (güvenlik yüzeyi çok büyür).
- **Kritik tasarım detayı:** `panel` sistem kullanıcısının `/etc/passwd`'deki
  shell'i KASITLI olarak `/usr/sbin/nologin` (bkz. doctor.sh → `useradd`) — SSH/
  login yoluyla oturum açılmasını engellemek için. `node-pty` bir login akışı
  KULLANMADIĞI için (doğrudan bir kabuk binary'sini exec ediyor) bu OS kaydını
  hiç okumuyor — `resolveShell()` `process.env.SHELL`/OS kullanıcı kaydını
  BİLİNÇLİ olarak yok sayıp `/bin/bash`'i sabit kullanıyor (okusaydı
  `/usr/sbin/nologin` dönerdi ve terminal komple bozulurdu). Bu, nologin
  korumasını "atlatmıyor" — o koruma SSH/su/console login yüzeyini korur, panel
  SÜRECİ zaten sürekli `panel` kullanıcısı olarak çalışıyor ve daha önceki her
  aşama (git.ts, backup.ts, github-keys.ts) zaten aynı yetkiyle alt süreç
  çalıştırıyordu — terminal yeni bir yetki eklemiyor, var olanı interaktif hale
  getiriyor.
- Mesaj protokolü: her iki yönde de JSON zarf (`{type:"input"|"resize"|"data"|"exit", ...}`),
  `resize` cols/rows [1,500] aralığına sınırlandı. Bağlantı kapanınca/hata
  verince PTY süreci öldürülüyor (`ws.on("close"/"error")`); `SIGTERM`/`SIGINT`'te
  tüm canlı PTY'ler temizleniyor (systemd restart'ında yetim kabuk süreci
  kalmasın diye).
- **Kasıtlı kapsam dışı:** bağlantı koptuğunda kabuk süreci KORUNMUYOR (tmux/
  screen benzeri kalıcı oturum çoğullama yok) — her WS bağlantısı = bir PTY,
  basitlik için bilinçli seçim (Aşama D'nin BackupSchedule tablosu atlaması
  gibi bir sadeleştirme).
- `node-pty` native derleme gerektiriyor (Python + C++ derleyici) — `doctor.sh`'a
  `build-essential`/`python3` kontrolü eklendi (PM2/backup-araçları gibi değil,
  bu ZORUNLU bir gereksinim çünkü olmadan `npm install` node-pty'yi derleyemez).
  Gerçek sunucularda (tipik olarak x86_64) `node-pty` önce bir PREBUILT binary
  indirmeyi dener (`node scripts/prebuild.js`), yalnızca bu başarısız olursa
  `node-gyp`'e (dolayısıyla derleyiciye) düşer.
- **Doğrulama:** `$HOME/panel-dev` akışıyla `next typegen`/`tsc --noEmit`/`eslint`/
  `npm run build` — 0 hata/uyarı, `/terminal` sayfası statik olarak derlendi.
  Bunun ÖTESİNDE, bu aşamanın riskini göz önünde bulundurarak GERÇEK bir uçtan
  uca duman testi de yapıldı: `node-pty`'nin bu sandbox'ta (linux-arm64,
  `nodejs.org` Node header indirmesi 403 ile engelli) derlenemediği doğrulandı
  — bu SADECE bir sandbox kısıtı (gerçek x86_64 sunucuda prebuilt binary
  sorunsuz iner), production riski değil. Bunu izole etmek için geçici bir
  sahte `node-pty` stub'ı (yalnızca panel-dev'de, mount'a HİÇ kopyalanmadı) ile
  `server.mjs` gerçekten başlatıldı ve: (1) normal bir HTTP isteği (`GET
  /login`) 200 döndü — middleware dahil Next'in kendisi custom server altında
  çalışıyor; (2) çerezsiz WS isteği `401` ile reddedildi — auth kapısı gerçek;
  (3) geçerli imzalı bir JWT çereziyle WS bağlantısı kuruldu, `resize`+`input`
  mesajları gönderildi ve sahte PTY'den beklenen `data` mesajları geri alındı —
  mesaj protokolünün UCTAN UCA çalıştığı doğrulandı. **Doğrulanamayan tek şey:**
  `next dev` altında Next'in kendi HMR websocket'iyle bizim upgrade
  dinleyicimizin gerçek bir tarayıcıda birlikte nasıl davrandığı — bu sandbox'ta
  canlı bir tarayıcı/WS istemcisi olmadığı için uçtan uca gözlemlenemedi;
  production (`NODE_ENV=production`, tek gerçek dağıtım yolu) bu etkileşime
  hiç ihtiyaç duymuyor (HMR yalnızca dev modunda var), bu yüzden risk yalnızca
  yerel geliştirme deneyimini ilgilendiriyor.

**Aşama G — Kullanıcı yönetimi + proje/izin bazlı RBAC + AuditLog — ✅ TAMAMLANDI
(2026-09-01, yol haritasının SON aşaması)**: `User.role` gerçek bir `UserRole`
enum'ına (`SUPER_ADMIN`/`MEMBER`) çevrildi, yeni `UserSiteAccess` (userId, siteId,
`SitePermission[]`, `@@unique([userId, siteId])`, her iki FK de `onDelete: Cascade`)
ve `AuditLog` (userId `onDelete: SetNull` + denormalize `username`, action,
targetType/Id, detail) tabloları eklendi.

- **Yetki modeli:** SUPER_ADMIN her zaman her siteye/işleme tam erişir — bunun
  için `UserSiteAccess`'te satır GEREKMEZ. MEMBER yalnızca kendisine açıkça
  `UserSiteAccess` ile verilmiş sitelerde, verilmiş izinler ölçüsünde erişir.
  `src/lib/permissions.ts`'teki `canManageSite()` (Aşama B'den beri var olan,
  şimdiye kadar hep `true` dönen iskelet) artık GERÇEK: rolü okuyup SUPER_ADMIN'i
  kısa devre yapıyor, MEMBER için `UserSiteAccess`'i `{userId_siteId}` bileşik
  anahtarıyla sorguluyor. Yeni `isSuperAdmin(userId)` yardımcısı, site-scoped
  OLMAYAN ama tehlikeli işlemler (sistem ayarları, kullanıcı yönetimi, terminal,
  site oluşturma/silme) için eklendi. Site-scoped ~20 route (git, restart,
  dosyalar, backup, deploy/actions key) HİÇBİRİ değişmedi — hepsi zaten TEK bir
  `canManageSite()` üzerinden geçiyordu, mantık orada değişince hepsi otomatik
  gerçek RBAC'a kavuştu (Aşama B'nin bu tasarımı tam burada karşılığını verdi).
- **Bilinçli tasarım kararı — JWT'ye rol GÖMÜLMEDİ:** session JWT payload'ı hâlâ
  yalnızca `{userId}` (bkz. `src/lib/auth.ts`, değişmedi). Rol her istekte
  `prisma.user.findUnique()` ile TAZE okunuyor. Trade-off bilerek yapıldı: JWT'ye
  rol gömmek bir DB sorgusu kazandırırdı ama bir kullanıcının rolü
  değiştirildiğinde/hesabı silindiğinde eski JWT (7 gün geçerli) yanlış yetkiyle
  çalışmaya devam ederdi. Taze DB okumasıyla bunun tam tersi bir güvenlik
  özelliği elde edildi: bir SUPER_ADMIN bir kullanıcıyı SİLDİĞİNDE veya rolünü
  düşürdüğünde, o kullanıcının JWT'si teknik olarak hâlâ geçerli olsa bile BİR
  SONRAKİ istekte `findUnique` boş/farklı rol döner ve tüm korumalı route'lar
  ANINDA reddeder — ayrı bir "oturumu iptal et" mekanizması gerekmeden.
- **Son süper admin kilitlenme koruması:** `wouldRemoveLastSuperAdmin()`
  (`/api/users/[id]` PATCH/DELETE içinde) — sistemde `role: SUPER_ADMIN` sayısı
  1'e düşecekse (silme veya MEMBER'a düşürme) işlem 400 ile reddediliyor.
  Ayrıca bir kullanıcı kendi hesabını silemiyor (ayrı, basit bir güvenlik ağı).
- **Yeni route'lar:** `GET /api/auth/me` (sidebar'daki gerçek kimlik + istemci
  tarafı SUPER_ADMIN koruması için); `GET/POST /api/users`,
  `GET/PATCH/DELETE /api/users/[id]` (hepsi SUPER_ADMIN-only, `passwordHash`
  HİÇBİR yanıtta dönmüyor); `GET /api/sites/[id]/access` (bu sitede MEMBER'ların
  mevcut izin durumu) + `PUT /api/sites/[id]/access/[userId]` (izin listesini
  TAMAMEN değiştirir — boş dizi grant satırını siler); `GET /api/audit` (son 200
  kayıt, ağır filtreleme/sayfalama BİLİNÇLİ olarak kapsam dışı — hafif, kronolojik
  bir liste yeterli görüldü).
- **Var olan route'lara eklenen roller:** site oluşturma (`POST /api/sites`) ve
  site silme (`DELETE /api/sites/[id]`) artık SUPER_ADMIN-only (provisioning/
  deprovisioning sistem düzeyinde işlemler yapıyor — `DELETE`, `UserSiteAccess`
  içindeki aynı isimli site-içi dosya silme iznine bilinçli olarak
  DELEGE EDİLMEDİ, isim çakışması var ama anlamları farklı). `GET /api/sites`
  MEMBER için `UserSiteAccess`'te `VIEW` izni olan sitelerle filtreleniyor.
  `/api/system/ports`, `/api/system/stats`, `/api/settings/s3*` hepsi
  SUPER_ADMIN-only oldu (sistem bilgisi/S3 kimlik bilgileri site-scoped değil).
- **Kendi kendine incelemede bulunup düzeltilen İKİ gerçek, önceden var olan
  açık** (Aşama D/E'deki "önce yaz, sonra dikkatlice tekrar oku" disipliniyle
  aynı): (1) `GET /api/sites/[id]/route.ts` HİÇBİR oturum/izin kontrolü
  yapmıyordu — herhangi bir authenticated kullanıcı herhangi bir sitenin
  detayını görebiliyordu; `getSession()` + `canManageSite(..., "VIEW")` eklendi.
  (2) `DELETE /api/sites/[id]/route.ts` da HİÇBİR kontrol yapmıyordu — bu Aşama
  G'den ÖNCE zararsızdı (sistemde tek kullanıcı tipi vardı, hepsi zaten
  SUPER_ADMIN'di) ama MEMBER hesapları var olur olmaz herhangi bir authenticated
  MEMBER herhangi bir siteyi silebilirdi; SUPER_ADMIN-only'ye çevrildi.
- **En yüksek öncelikli düzeltme — sunucu terminali:** `server.mjs`'teki
  `hasValidSession()` (Aşama F) yalnızca JWT'nin GEÇERLİ olduğunu kontrol
  ediyordu, ROLÜ değil — bu Aşama F'de zararsızdı (yine tek kullanıcı tipi) ama
  MEMBER hesapları eklenince ciddi bir yetki yükseltme açığına dönüşürdü (ham
  kabuk erişimi = dosya sistemi + .env'ler + .ssh, `UserSiteAccess` modelinin
  tamamen dışında). `isAuthorizedTerminalRequest()`'e çevrildi: JWT doğrulamanın
  ardından AYRICA `prisma.user.findUnique({where:{id:userId},select:{role:true}})`
  ile rol kontrol ediyor, yalnızca SUPER_ADMIN. Bu, `server.mjs`'e (derlemesiz,
  Prisma'yı `create-admin.mjs` ile aynı şekilde doğrudan import eden) ayrı bir
  `PrismaClient` örneği eklemeyi gerektirdi; `SIGTERM`/`SIGINT`'te `$disconnect()`
  çağrılıyor, 3 saniyelik bir zorla-çıkış zaman aşımıyla (asılı kalma riskine
  karşı — Aşama E'nin `ssh-keygen timeout` bulgusuyla aynı disiplin).
- **UI:** `src/hooks/use-current-user.ts` (`/api/auth/me`'yi saran küçük hook) +
  `src/components/super-admin-gate.tsx` (SADECE istemci tarafı yönlendirme —
  asıl koruma her zaman API'de). Yeni `/users` sayfası (roster + rol
  değiştirme + parola sıfırlama + silme). Yeni `/audit` sayfası (salt-okunur,
  basit kronolojik liste). Site detayına yeni "Erişim" kartı
  (`site-access-card.tsx`, SADECE SUPER_ADMIN'e görünür — MEMBER kullanıcıları
  ve mevcut izinlerini checkbox olarak gösterir, `PUT .../access/[userId]` ile
  kaydeder). `app-sidebar.tsx`'teki SABİT KODLANMIŞ "Süper Admin"/
  "admin@sunucu.local" gösterimi gerçek `useCurrentUser()`'a bağlandı; nav
  öğeleri artık role göre koşullu (Portlar/Terminal/Ayarlar/Kullanıcılar/
  Denetim Kaydı SADECE SUPER_ADMIN'e görünür — MEMBER yalnızca "Anasayfa" görür,
  site sayfalarına oradaki kartlardan ulaşır).
- **Denetim kaydı kapsamı — bilinçli olarak SINIRLI tutuldu:** her okuma/yazma
  DEĞİL, güvenlik açısından anlamlı olaylar loglanıyor: `SITE_CREATE/DELETE/
  START/STOP/RESTART`, `DEPLOY_KEY_CREATE/DELETE`, `ACTIONS_KEY_CREATE/DELETE`,
  `USER_CREATE/UPDATE/DELETE`, `SITE_ACCESS_GRANT/REVOKE`. `logAudit()`
  (`src/lib/audit.ts`) best-effort — yazma başarısız olsa bile ASLA çağıran
  işlemi engellemiyor/başarısız yapmıyor (yalnızca `console.error`).
- `middleware.ts`'in `config.matcher`'ına `/users/:path*`, `/audit/:path*`,
  `/api/users/:path*`, `/api/audit/:path*` eklendi (bu projede daha önce bir
  kez unutulup düzeltilen adım — bkz. Aşama D notu — bu sefer baştan
  atlanmadı). `/api/auth/me` bilinçli olarak matcher'a EKLENMEDİ (diğer
  `/api/auth/*` gibi PUBLIC — kendi `getSession()` kontrolünü kendisi yapıyor,
  `system/stats`'la aynı "defense in depth" deseni).
- Yeni migration: `20260901030000_user_rbac_audit` — gerçek Postgres 16'ya
  init + backup_s3 + github_keys + user_rbac_audit sırasıyla uygulanarak
  doğrulandı (enum dönüşümü, `SitePermission[]` dizi tipi, cascade/SetNull
  davranışları elle test edildi: kullanıcı silinince `UserSiteAccess` satırı
  gerçekten kayboldu, `AuditLog.userId` NULL'a düştü ama `username` okunabilir
  kaldı).
- `$HOME/panel-dev` akışıyla doğrulandı: `next typegen`/`tsc --noEmit`/`eslint`/
  `npm run build` — 0 hata/uyarı, 36 route (8 yeni: `/users`, `/audit`,
  `/api/auth/me`, `/api/users`, `/api/users/[id]`, `/api/audit`,
  `/api/sites/[id]/access`, `/api/sites/[id]/access/[userId]`). Prisma stub'ı
  (`UserRole`/`SitePermission` enum'ları, `UserSiteAccess`/`AuditLog`
  delegate'leri, bileşik anahtar desteği dahil) genişletildi ve hem tip hem
  runtime seviyesinde (`node -e` ile CRUD + cascade/SetNull) elle doğrulandı.

## Klasör Yapısı (bu repo)

```
scripts/        mevcut CLI scriptleri (bkz. docs/ ve proje hafızası)
docs/           bu doküman + certbot notları
panel/          Next.js + shadcn/ui uygulaması (frontend + backend bir arada)
backend/        kullanılmıyor (önceki plandan kalma, boş)
frontend/       kullanılmıyor (önceki plandan kalma, boş)
```

## Sıradaki Adımlar

1. ~~UI/UX mockupları (login, dashboard, site wizard)~~ ✅
2. ~~Next.js + shadcn/ui iskeletinin kurulması, mock veriyle ilk ekranlar~~ ✅
3. ~~`npm run build`'ı doğrula~~ ✅ (yukarıdaki operasyonel notta açıklanan yöntemle)
4. ~~`doctor.sh` yazımı~~ ✅ (repo kökünde `doctor.sh`)
5. ~~`install.sh` yazımı~~ ✅ (repo kökünde `install.sh`; henüz eklenmemiş `db:migrate`/`create-admin` npm script'lerini bulamazsa o adımları uyararak atlar, sonradan tekrar çalıştırılabilir — idempotent)
6. ~~Prisma + PostgreSQL şeması, auth + super admin bootstrap (Route Handler'lar)~~ ✅
7. ~~Sistem metrikleri API'si (Route Handler, `systeminformation`)~~ ✅
8. ~~Site yönetimi API'si (6 tip + process yönetimi, Route Handler'lar — CRUD kısmı; gerçek provisioning madde 9'da)~~ ✅
9. ~~Wizard'ın 3. adımını (gerçek provisioning) bağlamak~~ ✅ sudoers + `provision-site.sh` ile (bkz. Güvenlik Notları). (Canlı, adım adım log akışı kapsam dışı bırakıldı — senkron/best-effort sonuç ekranı var.)
10. Gerçek/test bir Ubuntu sunucusunda uçtan uca kurulum testi.
11. Genişletilmiş özellik yol haritası (bkz. yukarıdaki bölüm) — ~~Aşama A (port görüntüleyici)~~ ✅, ~~Aşama B (git pull + proje restart + RBAC şema iskeleti)~~ ✅, ~~Aşama C (dosya yöneticisi + .env yönetimi + Monaco editör)~~ ✅, ~~Aşama D (Ayarlar ekranı/AWS-S3 + veritabanı yedekleme)~~ ✅, ~~Aşama E (GitHub deploy/actions key yönetimi)~~ ✅, ~~Aşama F (sunucu terminali)~~ ✅, ~~Aşama G (tam kullanıcı/RBAC yönetimi + AuditLog)~~ ✅. **Yol haritası TAMAMLANDI (2026-09-01).**
