import { tr } from "./locales/tr"
import { en } from "./locales/en"

export type Language = "tr" | "en"

export const locales = { tr, en }

export type { TranslationDict } from "./locales/tr"

/**
 * Dot-notation ile nesne içerisinden çeviri metnini bulur ve değişkenleri ({key}) yerine koyar.
 * Örnek: getTranslation("tr", "common.save") => "Kaydet"
 * Örnek: getTranslation("en", "sites.totalSitesCount", { count: 5 }) => "Total 5 sites hosted"
 */
export function getTranslation(
  lang: Language,
  path: string,
  params?: Record<string, string | number>
): string {
  const dict = locales[lang] || locales.tr
  const keys = path.split(".")

  let current: unknown = dict
  for (const key of keys) {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      // Fallback: Eğer seçili dilde yoksa Türkçe sözlüğe bak
      let fallbackCurrent: unknown = locales.tr
      for (const fbKey of keys) {
        if (
          fallbackCurrent &&
          typeof fallbackCurrent === "object" &&
          fbKey in (fallbackCurrent as Record<string, unknown>)
        ) {
          fallbackCurrent = (fallbackCurrent as Record<string, unknown>)[fbKey]
        } else {
          return path
        }
      }
      current = fallbackCurrent
      break
    }
  }

  if (typeof current !== "string") {
    return path
  }

  let text = current
  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal))
    }
  }

  return text
}
