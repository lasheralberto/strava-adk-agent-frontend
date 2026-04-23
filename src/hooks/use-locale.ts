import { useMemo } from 'react'
import { TEXTS, type Lang } from '@/data/texts'

/**
 * Detects the user's language from the browser locale.
 * Returns Spanish if the browser/OS language starts with 'es', English otherwise.
 * This naturally maps to the user's country/region setting.
 */
function detectLang(): Lang {
  const primary = (navigator.language ?? 'en').split('-')[0].toLowerCase()
  return primary === 'es' ? 'es' : 'en'
}

export function useLocale() {
  const lang = useMemo(detectLang, [])
  return { lang, t: TEXTS[lang] }
}
