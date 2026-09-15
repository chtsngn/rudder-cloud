/**
 * "Proje restart" — sitenin `processManager` alanına göre doğru yeniden
 * başlatma yolunu seçer. SYSTEMD dışındakiler panel süreci tarafından
 * doğrudan (sudo OLMADAN) çalıştırılır — bu yüzden yalnızca panelin zaten
 * erişebildiği kaynaklarla sınırlıdır (bkz. git.ts'teki aynı kısıtlama:
 * NODEJS/PYTHON'un çalışma dizini her zaman panel'e ait).
 */
import { execFile } from "node:child_process"
import { access, constants as fsConstants } from "node:fs/promises"
import { promisify } from "node:util"

import { domainToSlug, isValidAbsolutePath, ProvisionError, serviceAction } from "@/lib/provision"
import { resolveSiteWorkdir, type SiteLike } from "@/lib/site-paths"

const execFileAsync = promisify(execFile)
const RESTART_TIMEOUT_MS = 60_000

export class RestartError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RestartError"
  }
}

function extractDetail(error: unknown): string {
  const err = error as NodeJS.ErrnoException & { stderr?: string }
  return err.stderr?.toString().trim() || err.message || "Bilinmeyen hata."
}

type RestartableSite = SiteLike & {
  domain: string
  processManager: string
  customRestartCommand: string | null
}

export async function restartSite(site: RestartableSite): Promise<void> {
  switch (site.processManager) {
    case "SYSTEMD": {
      try {
        await serviceAction(site.domain, "restart")
      } catch (error) {
        throw new RestartError(
          error instanceof ProvisionError ? error.message : "Servis yeniden başlatılamadı."
        )
      }
      return
    }

    case "DOCKER_COMPOSE": {
      const workdir = resolveSiteWorkdir(site)
      if (!workdir) throw new RestartError("Bu site türü için çalışma dizini belirlenemedi.")
      try {
        await execFileAsync("docker", ["compose", "restart"], {
          cwd: workdir,
          timeout: RESTART_TIMEOUT_MS,
        })
      } catch (error) {
        throw new RestartError(extractDetail(error))
      }
      return
    }

    case "PM2": {
      const name = domainToSlug(site.domain)
      try {
        await execFileAsync("pm2", ["restart", name], { timeout: RESTART_TIMEOUT_MS })
      } catch (error) {
        throw new RestartError(extractDetail(error))
      }
      return
    }

    case "CUSTOM_SCRIPT": {
      const workdir = resolveSiteWorkdir(site)
      if (!workdir) throw new RestartError("Bu site türü için çalışma dizini belirlenemedi.")
      const cmd = site.customRestartCommand
      if (!cmd) throw new RestartError("Özel restart komutu tanımlı değil.")
      if (!isValidAbsolutePath(cmd)) {
        throw new RestartError("Özel restart komutu geçerli bir mutlak yol olmalı.")
      }
      if (!cmd.startsWith(`${workdir}/`)) {
        throw new RestartError("Özel restart komutu site dizini içinde olmalı.")
      }
      try {
        await access(cmd, fsConstants.X_OK)
      } catch {
        throw new RestartError(`Betik çalıştırılabilir değil veya bulunamadı: ${cmd}`)
      }
      try {
        await execFileAsync(cmd, [], { cwd: workdir, timeout: RESTART_TIMEOUT_MS })
      } catch (error) {
        throw new RestartError(extractDetail(error))
      }
      return
    }

    default:
      throw new RestartError(`Bilinmeyen process manager: ${site.processManager}`)
  }
}

export type DockerComposeControlAction = "up" | "down" | "restart"

/**
 * Manuel "docker compose up/down/restart" — `restartSite`'ın DOCKER_COMPOSE
 * dalıyla AYNI yetkiyle (panel süreci, sudo YOK) çalışır; NODEJS/PYTHON/
 * REVERSE_PROXY/DOCKER işleri panel:panel sahipliğinde olduğu için bu
 * yeterli (bkz. site-paths.ts). `up` container'ları görüntüde yoksa
 * oluşturur (`-d --remove-orphans`); `down` durdurup kaldırır; `restart`
 * mevcut container'ları yeniden başlatır (image/compose değişikliği
 * uygulamaz — bunun için önce `down` sonra `up` gerekir).
 */
export async function dockerComposeControl(
  site: SiteLike,
  action: DockerComposeControlAction
): Promise<void> {
  const workdir = resolveSiteWorkdir(site)
  if (!workdir) throw new RestartError("Bu site türü için çalışma dizini belirlenemedi.")

  const args =
    action === "up" ? ["compose", "up", "-d", "--remove-orphans"] : ["compose", action]

  try {
    await execFileAsync("docker", args, { cwd: workdir, timeout: RESTART_TIMEOUT_MS })
  } catch (error) {
    throw new RestartError(extractDetail(error))
  }
}
