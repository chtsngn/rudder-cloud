# Rudder Cloud — Sunucu Yönetim Paneli

**Rudder Cloud**, CloudPanel'den ilham alan ama daha geniş bir özellik setine sahip,
kendi sunucunuza kurduğunuz bir sunucu yönetim paneli: site kurulumu, Git tabanlı
dağıtım, dosya yöneticisi, veritabanı yedekleme, GitHub anahtar yönetimi, web tabanlı
terminal ve tam kullanıcı/rol bazlı erişim kontrolü — hepsi kendi sunucunuzdaki tek
bir panelden.

Ayrı bir backend servisi çalıştırmanız gerekmiyor; tek bir Next.js uygulaması olarak
gelir ve düz bir Ubuntu/Debian sunucusuna tek bir script ile kendini kurar.

## Özellikler

- **Site sihirbazı** — WordPress, PHP, Node.js, statik, Python veya reverse-proxy
  siteleri, yönlendirmeli bir form üzerinden kurar. Nginx vhost, SSL (Certbot ile),
  sitenin kendi Linux kullanıcısı ve — Node.js/Python için — ayrı bir systemd
  servisi otomatik oluşturulur.
- **Process yönetimi** — Node.js ve Python sitelerini başlat/durdur/yeniden başlat;
  çökme sonrası otomatik yeniden başlatma ve arayüzden canlı log takibi
  (`journalctl`).
- **Port görüntüleyici** — sunucudaki tüm dinleyen TCP portlarını (Docker varsa
  container portlarını da) yönettiğiniz sitelerle eşleştirerek gösterir, yeni
  dağıtımlar için boş port önerir.
- **Git tabanlı dağıtım** — bir Node.js/Python sitesini bir Git deposuna ve dalına
  bağlayın; elle veya belirli aralıklarla pull edin, ardından systemd, Docker
  Compose, PM2 veya özel bir script ile yeniden başlatın — yalnızca dağıtılan
  commit gerçekten değiştiyse.
- **Dosya yöneticisi** — bir sitenin kendi dizinini gezin, düzenleyin (Monaco
  editör), yükleyin/indirin, zip'leyin; `.env.example`'dan tek tıkla `.env`
  oluşturun. Path traversal ve symlink ile kaçış girişimleri dosya sistemi
  katmanında engellenir.
- **Veritabanı yedekleme** — PostgreSQL, MySQL/MariaDB (WordPress'in
  `wp-config.php`'si dahil) ve MongoDB'yi otomatik algılar; zamanlanmış, sıkıştırılmış
  yedekler alır, saklama süresi ayarlanabilir ve isteğe bağlı olarak S3 uyumlu bir
  depoya yükler.
- **GitHub anahtar yönetimi** — bir site için salt-okunur deploy key (`git pull`
  için) veya bir Actions key (CI'ın sunucuya SSH ile bağlanması için) üretir; özel
  anahtar hiçbir zaman veritabanına yazılmaz.
- **Web terminali** — tarayıcıda gerçek bir PTY (xterm.js + node-pty), yetkisiz
  panel kullanıcısı olarak çalışır, yalnızca süper adminlere açık.
- **Kullanıcılar, roller ve denetim kaydı** — ekip üyelerini `MEMBER` olarak davet
  edin ve site bazında izin verin (görüntüleme, dosya düzenleme, yeniden başlatma,
  silme, yedekleri yönetme, deploy key yönetme); `SUPER_ADMIN`'ler her şeye tam
  erişime sahiptir. Hassas her işlem denetim kaydına (audit log) yazılır.

## Desteklenen site tipleri

| Tip | Ne kurulur |
|---|---|
| WordPress | Nginx vhost, PHP-FPM, MySQL/MariaDB veritabanı, WordPress kurulumu |
| PHP | Nginx vhost, PHP-FPM |
| Node.js | Nginx reverse proxy, ayrı systemd servisi |
| Python | Nginx reverse proxy, ayrı systemd servisi |
| Statik | Bir dizini sunan Nginx vhost |
| Reverse proxy | İstediğiniz bir upstream URL'e Nginx reverse proxy |

Tüm tipler isteğe bağlı olarak bir domain, `www` alias'ı ve Certbot ile SSL
sertifikası alabilir.

## Gereksinimler

- Temiz bir Ubuntu veya Debian sunucu (apt tabanlı; başka dağıtımlar desteklenmiyor)
- Root erişimi (kurulum script'i kullanmadan önce onay ister)
- Giden internet erişimi (paket kurulumu ve kullanılıyorsa GitHub/S3 için)

Geri kalan her şey — Node.js 20+, PostgreSQL, Nginx, Certbot, MySQL/MariaDB,
PHP-FPM, `node-pty` için derleme araçları — `doctor.sh` tarafından otomatik
kontrol edilip kurulur.

## Hızlı kurulum

Bir sürüm yayınlandıktan sonra (aşağıdaki [Sürüm yayınlama](#sürüm-yayınlama)
bölümüne bakın), sunucu CloudPanel'in kurulum betiğiyle aynı mantıkla tek bir
komutla kurulabilir:

```bash
curl -sSL https://github.com/chtsngn/rudder-cloud/releases/latest/download/bootstrap.sh -o /usr/local/bin/rudder-cloud-install
HASH=$(curl -sSL https://github.com/chtsngn/rudder-cloud/releases/latest/download/bootstrap.sh.sha256 | awk '{print $1}')
echo "${HASH}  /usr/local/bin/rudder-cloud-install" | sha256sum -c && chmod +x /usr/local/bin/rudder-cloud-install
sudo /usr/local/bin/rudder-cloud-install
```

Bu komut bootstrap script'ini indirir, sağlama toplamını (checksum) doğrular,
projeyi `/opt/sunucu-paneli-src` içine klonlar ve `install.sh`'a devreder. En
son sürüm yerine belirli bir sürümü sabitlemek isterseniz:

```bash
sudo GIT_REF=v1.0.0 /usr/local/bin/rudder-cloud-install
```

## Elle kurulum

```bash
git clone https://github.com/chtsngn/rudder-cloud.git
cd rudder-cloud
sudo bash install.sh
```

`install.sh` önce `doctor.sh`'ı çalıştırır (gereksinimleri kontrol edip kurar,
yetkisiz `panel` sistem kullanıcısını ve PostgreSQL rolünü oluşturur), ardından
paneli derler, veritabanı migration'larını çalıştırır, ilk süper admin hesabını
oluşturur, Nginx vhost'unu yazar ve `panel.service` systemd birimini başlatır.
Bağımlılık kurulumlarını otomatik onaylamak için `--yes` bayrağını ekleyebilirsiniz.

## İlk giriş

Tarayıcıdan `http://<sunucu-ip>:24428` adresini açın. Süper admin kullanıcı adı ve
bir kereliğine ekrana basılan şifre, sunucuda `/root/.panel-credentials`
dosyasına da kaydedilir.

## Sürüm yayınlama

Bir sürüm etiketlemek, damgalanmış bir `bootstrap.sh` ve SHA-256 özetini
`.github/workflows/release.yml` aracılığıyla bir GitHub Release olarak yayınlar:

```bash
git tag v1.0.0
git push --tags
```

## Geliştirme

```bash
cd panel
npm install
npm run db:migrate:dev   # Prisma migration'larını yerel bir Postgres'e uygular
npm run dev              # özel sunucuyu (server.mjs) :3000'de başlatır
```

Uygulama tek bir Next.js (App Router) projesidir — API route'ları
`src/app/api/**` altında yaşar, ayrı bir backend süreci yoktur. Commit'ten önce
`npm run build` / `npm run lint` temiz geçmelidir.

## Güvenlik modeli

- Panel süreci hiçbir zaman root olarak değil, yetkisiz ve `nologin` bir sistem
  kullanıcısı (`panel`) olarak çalışır.
- Bu kullanıcının şifresiz `sudo` yetkisi yalnızca TEK bir script için tanımlıdır
  (`panel/scripts/provision-site.sh`), argümanlar dizi olarak geçirilir (shell
  yorumlaması yok) — başka hiçbir komuta genel sudo izni verilmez.
- Oturum çerezleri yalnızca bir kullanıcı ID'si taşır; roller ve izinler her
  istekte veritabanından taze okunur, böylece rolü düşürülen veya silinen bir
  kullanıcı erişimini anında kaybeder.
- Sırlar (S3 kimlik bilgileri) diskte AES-256-GCM ile şifreli tutulur; deploy/
  Actions özel anahtarları hiçbir zaman veritabanına yazılmaz.

## Dokümantasyon

Tam mimari ve karar geçmişi için (Türkçe) [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
dosyasına bakın.

Bu belgenin İngilizce sürümü [`README.md`](README.md) dosyasındadır.

## Lisans

[MIT](LICENSE)
