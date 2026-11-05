/**
 * Site adına çalıştırılan komutların ortamı: deploy komutu, özel restart
 * betiği, `docker` / `docker compose`, git, veritabanı dökümleri.
 *
 * Panel süreci systemd EnvironmentFile ile panelin KENDİ .env'ini taşır
 * (DATABASE_URL — panel DB'sinin parolalı adresi, PORT, AUTH_SECRET,
 * SETTINGS_ENCRYPTION_KEY, NODE_ENV...), `npm run start` de npm_* değişkenleri
 * ve PATH'e panelin node_modules/.bin'ini ekler. Bunlar bir site komutuna
 * geçerse: compose `${VAR}` değerlerini kabuk ortamından sitenin .env'inden
 * ÖNCE okuduğu için `${DATABASE_URL}`, `${PORT}` panelin değerleriyle dolar
 * (v1.6.0-rc.1'de görüldü: migrate konteyneri panel DB'sinin parolalı
 * adresiyle başladı, uygulama sitenin PORT'u yerine 3000'de açılıp 502 verdi)
 * ve panelin sırları site konteynerlerine sızar.
 *
 * Bu yüzden panelin ortamından yalnız aşağıdaki beyaz liste geçer; komutun
 * ihtiyaç duyduğu diğer her şeyi (CI, DEPLOY_TRIGGER, GIT_COMMIT,
 * GIT_SSH_COMMAND, PGPASSWORD...) çağıran `extra` ile açıkça verir.
 * COMPOSE_* bilerek listede yok: panelin ortamındaki bir COMPOSE_FILE /
 * COMPOSE_PROJECT_NAME her sitenin compose'unu ele geçirirdi.
 */

const INHERITED_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LANGUAGE",
  "TZ",
  "TMPDIR",
  // Docker/buildx CLI ayarı (install.sh .env'e yazar) — derleyici seçimi, registry girişleri.
  "DOCKER_CONFIG",
  // Vekil sunucu arkasındaki sunucularda git/docker pull bunlarsız çalışmaz.
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
])

const INHERITED_PREFIXES = ["LC_", "DOCKER_", "BUILDX_"]

export function isInheritedEnvKey(key: string): boolean {
  return INHERITED_KEYS.has(key) || INHERITED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** `npm run` panelin node_modules/.bin'ini PATH'in başına ekler — site komutu
 * `next`, `prisma` gibi araçları sitenin değil panelin kopyasından bulmasın. */
function withoutNodeModulesBins(path: string): string {
  const kept = path
    .split(":")
    .filter((dir) => dir && !dir.includes("/node_modules/") && !dir.endsWith("/node_modules"))
    .join(":")
  return kept || DEFAULT_PATH
}

const DEFAULT_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

/**
 * Site komutu için temiz ortam: panelin ortamından yalnız beyaz liste, üstüne
 * `extra` (undefined değerler atlanır). `source` yalnız testler içindir.
 */
export function siteCommandEnv(
  extra: Record<string, string | undefined> = {},
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && isInheritedEnvKey(key)) env[key] = value
  }
  if (env.PATH) env.PATH = withoutNodeModulesBins(env.PATH)
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) env[key] = value
  }
  // NODE_ENV bilerek yok (Next'in tipi onu zorunlu sayıyor): panelin
  // "production"ı sitenin derlemesini değiştirmesin.
  return env as NodeJS.ProcessEnv
}
