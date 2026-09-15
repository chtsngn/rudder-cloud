export const APP_VERSION = "v1.3.2"

export const GITHUB_REPO = "chtsngn/rudder-cloud"
export const RELEASE_TAG_RE = /^v\d+\.\d+\.\d+$/

/** `v1.3.1` > `v1.3.0` → pozitif; eşit → 0. "v" ön eki isteğe bağlı. */
export function compareSemver(v1: string, v2: string): number {
  const clean = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0)
  const [maj1 = 0, min1 = 0, pat1 = 0] = clean(v1)
  const [maj2 = 0, min2 = 0, pat2 = 0] = clean(v2)
  if (maj1 !== maj2) return maj1 - maj2
  if (min1 !== min2) return min1 - min2
  return pat1 - pat2
}
