/**
 * GitHub REST API için paylaşılan sabitler.
 *
 * Eskiden burada bir de Deploy Key REST istemcisi (`/repos/{owner}/{repo}/keys`
 * ekleme/listeleme/silme) vardı — GitHub App entegrasyonu (bkz.
 * src/lib/github-app.ts) panelin KENDİ pull mekanizması için buna tamamen son
 * verdiği için (installation token zaten kimlik doğruluyor, ayrı bir SSH
 * deploy key'e hiç gerek yok) 2026-09-07'de kaldırıldı — ayrıca bu istemci
 * hiçbir zaman doğru çalışmadı: manifest'te "administration" izni hiç
 * istenmediği için GitHub her zaman "Resource not accessible by integration"
 * ile reddediyordu (bkz. docs/ARCHITECTURE.md).
 */
export const GITHUB_API_BASE = "https://api.github.com"
export const GITHUB_API_VERSION = "2022-11-28"
export const USER_AGENT = "Rudder-Cloud-Panel/1.2.4"
