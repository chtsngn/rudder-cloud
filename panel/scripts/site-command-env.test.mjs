// Site komutlarının panelin ortamını devralmadığının testi (bkz.
// src/lib/command-env.ts). Çalıştırma: `npm test` (Node >= 22.18 — .ts
// dosyasını doğrudan içe aktarır). Docker CLI'ında compose yoksa compose testi
// atlanır.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { siteCommandEnv } from "../src/lib/command-env.ts"

// systemd EnvironmentFile + `npm run start` sonrası panel sürecinin ortamına benzer.
const PANEL_ENV = {
  PATH: "/opt/sunucu-paneli/node_modules/.bin:/usr/lib/node_modules/npm/node_modules/@npmcli/run-script/lib/node-gyp-bin:/usr/local/bin:/usr/bin:/bin",
  HOME: "/opt/sunucu-paneli",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  DATABASE_URL: "postgresql://panel:panel-parolasi@localhost:5432/panel_db",
  PORT: "3000",
  AUTH_SECRET: "panel-auth-secret",
  SETTINGS_ENCRYPTION_KEY: "panel-settings-key",
  NODE_ENV: "production",
  BACKUP_DIR: "/var/lib/rudder/backups",
  DEPLOY_KEYS_DIR: "/var/lib/rudder/ssh",
  PANEL_SRC_DIR: "/opt/sunucu-paneli-src",
  PANEL_PUBLIC_HOST: "127.0.0.1",
  npm_lifecycle_event: "start",
  npm_package_name: "panel",
  COMPOSE_PROJECT_NAME: "panel",
  DOCKER_CONFIG: "/var/lib/rudder/docker",
  DOCKER_HOST: "unix:///var/run/docker.sock",
  BUILDX_BUILDER: "sakin",
}

test("panelin sırları ve ayarları site komutuna geçmez", () => {
  const env = siteCommandEnv({}, PANEL_ENV)
  for (const key of [
    "DATABASE_URL", "PORT", "AUTH_SECRET", "SETTINGS_ENCRYPTION_KEY", "NODE_ENV", "BACKUP_DIR",
    "DEPLOY_KEYS_DIR", "PANEL_SRC_DIR", "PANEL_PUBLIC_HOST", "npm_lifecycle_event", "npm_package_name",
    "COMPOSE_PROJECT_NAME",
  ]) {
    assert.equal(env[key], undefined, `${key} geçmemeli`)
  }
})

test("beyaz liste geçer, PATH'ten node_modules dizinleri çıkar", () => {
  const env = siteCommandEnv({}, PANEL_ENV)
  assert.equal(env.HOME, "/opt/sunucu-paneli")
  assert.equal(env.LANG, "C.UTF-8")
  assert.equal(env.LC_ALL, "C.UTF-8")
  assert.equal(env.DOCKER_CONFIG, "/var/lib/rudder/docker")
  assert.equal(env.DOCKER_HOST, "unix:///var/run/docker.sock")
  assert.equal(env.BUILDX_BUILDER, "sakin")
  assert.equal(env.PATH, "/usr/local/bin:/usr/bin:/bin")
})

test("açıkça verilenler eklenir, undefined atlanır", () => {
  const env = siteCommandEnv(
    { CI: "true", DEPLOY_TRIGGER: "manual", GIT_COMMIT: undefined, GIT_SSH_COMMAND: "ssh -i /k" },
    PANEL_ENV
  )
  assert.equal(env.CI, "true")
  assert.equal(env.DEPLOY_TRIGGER, "manual")
  assert.equal(env.GIT_SSH_COMMAND, "ssh -i /k")
  assert.equal("GIT_COMMIT" in env, false)
})

function hasDockerCompose() {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

test(
  "kabukta PORT/DATABASE_URL varken site compose'u kendi .env değerlerini alır",
  { skip: !hasDockerCompose() && "docker compose yok" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "rudder-env-test-"))
    try {
      writeFileSync(
        join(dir, "docker-compose.yml"),
        [
          "services:",
          "  migrate:",
          "    image: alpine",
          "    environment:",
          "      DATABASE_URL: ${DATABASE_URL:-postgresql://varsayilan}",
          "  app:",
          "    image: alpine",
          '    ports: ["${PORT:-3000}:${PORT:-3000}"]',
          "    environment:",
          "      PORT: ${PORT:-3000}",
          "",
        ].join("\n")
      )
      writeFileSync(join(dir, ".env"), "PORT=3020\nDATABASE_URL=postgresql://site:site-parolasi@db:5432/site\n")
      // Docker CLI ayarı (DOCKER_CONFIG vb.) bu makinenin kalır; panelden yalnız sızan değerler eklenir.
      const panelShell = { ...process.env }
      for (const key of ["DATABASE_URL", "PORT", "AUTH_SECRET", "SETTINGS_ENCRYPTION_KEY", "NODE_ENV", "npm_lifecycle_event"]) {
        panelShell[key] = PANEL_ENV[key]
      }
      const config = (env) =>
        JSON.parse(execFileSync("docker", ["compose", "config", "--format", "json"], { cwd: dir, env, encoding: "utf8" }))

      // Kontrol: panelin ortamını olduğu gibi geçirmek (rc.1 davranışı) sitenin .env'ini ezer.
      const leaked = config(panelShell)
      assert.equal(leaked.services.app.environment.PORT, "3000")
      assert.match(leaked.services.migrate.environment.DATABASE_URL, /panel-parolasi/)

      const clean = config(siteCommandEnv({}, panelShell))
      assert.equal(clean.services.app.environment.PORT, "3020")
      assert.equal(String(clean.services.app.ports[0].published), "3020")
      assert.equal(clean.services.migrate.environment.DATABASE_URL, "postgresql://site:site-parolasi@db:5432/site")
      assert.doesNotMatch(JSON.stringify(clean), /panel-parolasi|panel-auth-secret|panel-settings-key/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
