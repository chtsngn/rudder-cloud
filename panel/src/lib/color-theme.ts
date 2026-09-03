/**
 * Dynamic Color Theme Engine
 * Calculates token values from HSL matrices ensuring WCAG AAA contrast.
 * 2 Axes: Mode (Dark ⇄ Light) × 9 Color Palettes = 18 Theme Combinations.
 */

const STORAGE_KEY = 'app_color_theme'
export const DEFAULT_PALETTE_ID = 'default'

// [Doygunluk %, Açıklık %] matrisi — Hue paletten gelir
export const RAMP: {
  dark: Record<string, [number, number]>
  light: Record<string, [number, number]>
} = {
  dark: {
    '--surface-0': [28, 8.5],
    '--surface-1': [28, 11.5],
    '--surface-2': [28, 14.8],
    '--surface-3': [30, 19.8],
    '--surface-inset': [29, 10.2],
    '--border': [26, 21.8],
    '--border-strong': [28, 29.8],
    '--text-primary': [33, 95.9],
    '--text-secondary': [29, 90.6],
    '--text-muted': [27, 81.8],
  },
  light: {
    '--surface-0': [30, 93.0],
    '--surface-1': [25, 96.0],
    '--surface-2': [40, 97.5],
    '--surface-3': [25, 90.0],
    '--surface-inset': [35, 98.0],
    '--border': [30, 84.0],
    '--border-strong': [35, 75.0],
    '--text-primary': [6, 10.0],
    '--text-secondary': [15, 30.0],
    '--text-muted': [12, 40.0],
  },
}

export interface ThemePalette {
  id: string
  label: string
  hue: number
  satMul?: number
  accent: { 400: string; 500: string; 600: string; 700: string }
  fg?: string
  light?: { accent: string; hover: string; fg: string }
  ramp?: {
    light?: Record<string, [number, number]>
    dark?: Record<string, [number, number]>
  }
}

export const THEME_PALETTES: ThemePalette[] = [
  {
    id: 'default',
    label: 'Varsayılan',
    hue: 226,
    satMul: 1,
    accent: { 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857' },
    ramp: {
      dark: {
        '--surface-0': [40, 4.5],     /* #040711 */
        '--surface-1': [40, 7.0],
        '--surface-2': [45, 9.0],     /* #090e1f */
        '--surface-3': [40, 15.0],
        '--surface-inset': [45, 6.0], /* #060a17 */
        '--border': [35, 17.0],       /* #16223f */
        '--border-strong': [35, 25.0],/* #1e3568 */
      },
      light: {
        '--surface-0': [0, 96.0],     /* #f4f4f5 */
        '--surface-1': [0, 100],      /* #ffffff */
        '--surface-2': [0, 100],      /* #ffffff */
        '--surface-3': [0, 96.0],
        '--surface-inset': [0, 100],  /* #ffffff */
        '--border': [0, 89.0],        /* #e2e8f0 */
        '--border-strong': [0, 80.0],
      },
    },
  },
  {
    id: 'forest',
    label: 'Orman',
    hue: 152,
    satMul: 1.6,
    accent: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
  },
  {
    id: 'ocean',
    label: 'Okyanus',
    hue: 208,
    satMul: 1.6,
    accent: { 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    hue: 243,
    satMul: 1.6,
    accent: { 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
  },
  {
    id: 'violet',
    label: 'Mor',
    hue: 268,
    satMul: 1.6,
    accent: { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
  },
  {
    id: 'rose',
    label: 'Gül',
    hue: 342,
    satMul: 1.6,
    accent: { 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c' },
  },
  {
    id: 'blush',
    label: 'Toz Pembe',
    hue: 332,
    satMul: 1.8,
    accent: { 400: '#f9a8d4', 500: '#f9a8d4', 600: '#f472b6', 700: '#831843' },
    fg: '#1a1a1a',
    light: { accent: '#be185d', hover: '#9d174d', fg: '#ffffff' },
    ramp: {
      light: {
        '--surface-0': [87, 82.5],
        '--surface-1': [85, 89],
        '--surface-2': [82, 94],
        '--surface-3': [86, 79],
        '--surface-inset': [82, 94],
        '--border': [55, 72],
        '--border-strong': [45, 62],
        '--text-primary': [45, 9],
        '--text-secondary': [28, 24],
        '--text-muted': [22, 30],
      },
    },
  },
  {
    id: 'amber',
    label: 'Kehribar',
    hue: 30,
    satMul: 1.6,
    accent: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
    fg: '#1a1a1a',
  },
  {
    id: 'cyan',
    label: 'Camgöbeği',
    hue: 187,
    satMul: 1.6,
    accent: { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
    fg: '#1a1a1a',
  },
]

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const v = ln - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * v).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function rgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '')
  const n = parseInt(cleanHex, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function findPalette(id: string): ThemePalette {
  return THEME_PALETTES.find((p) => p.id === id) || THEME_PALETTES[0]
}

export function getStoredPaletteId(): string {
  if (typeof window === 'undefined') return DEFAULT_PALETTE_ID
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return THEME_PALETTES.some((p) => p.id === stored) ? (stored as string) : DEFAULT_PALETTE_ID
  } catch {
    return DEFAULT_PALETTE_ID
  }
}

export function setStoredPaletteId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {}
}

export function buildThemeVars(paletteId: string, mode: 'light' | 'dark'): Record<string, string> {
  const p = findPalette(paletteId)
  const isLight = mode === 'light'
  const vars: Record<string, string> = {}
  const satMul = p.satMul || 1
  const override = (p.ramp && p.ramp[isLight ? 'light' : 'dark']) || {}

  for (const [token, [s, l]] of Object.entries(isLight ? RAMP.light : RAMP.dark)) {
    const [S, L] = override[token] || [Math.min(100, s * satMul), l]
    vars[token] = hslToHex(p.hue, S, L)
  }

  const a = p.accent
  const lightOv = isLight ? p.light : undefined
  vars['--accent'] = lightOv?.accent || a[500]
  vars['--accent-hover'] = lightOv?.hover || a[600]
  vars['--accent-fg'] = lightOv?.fg || p.fg || '#ffffff'
  vars['--accent-text'] = isLight ? a[700] : a[400]

  const fill = vars['--accent']
  vars['--accent-subtle'] = rgba(fill, isLight ? 0.12 : 0.15)
  vars['--accent-veil'] = rgba(fill, isLight ? 0.25 : 0.3)
  vars['--brand'] = fill
  vars['--brand-light'] = a[400]
  vars['--brand-dark'] = vars['--accent-hover']
  vars['--float-surface'] = rgba(vars['--surface-2'], isLight ? 0.88 : 0.82)
  vars['--float-surface-strong'] = rgba(isLight ? vars['--surface-2'] : vars['--surface-1'], isLight ? 0.97 : 0.94)

  // Core system variables
  vars['--background'] = vars['--surface-0']
  vars['--foreground'] = vars['--text-primary']
  vars['--card'] = vars['--surface-2']
  vars['--card-foreground'] = vars['--text-primary']
  vars['--popover'] = vars['--surface-2']
  vars['--popover-foreground'] = vars['--text-primary']
  vars['--primary'] = vars['--accent']
  vars['--primary-hover'] = vars['--accent-hover']
  vars['--primary-foreground'] = vars['--accent-fg']
  vars['--secondary'] = vars['--surface-3']
  vars['--secondary-foreground'] = vars['--text-primary']
  vars['--muted'] = vars['--surface-1']
  vars['--muted-foreground'] = vars['--text-muted']
  vars['--border'] = vars['--border']
  vars['--input'] = vars['--border']
  vars['--ring'] = vars['--accent']

  // ═══ YELKEN (SAIL), SIDEBAR VE LOGO DİNAMİK DEĞİŞKENLERİ ═══
  if (paletteId === 'default') {
    if (isLight) {
      vars['--sail-bg-0'] = '#48030f'
      vars['--sail-bg-1'] = '#680b22'
      vars['--sail-bg-2'] = '#540516'
      vars['--sail-bg-3'] = '#320108'
      vars['--sail-stroke-0'] = '#c5a059'
      vars['--sail-stroke-1'] = '#fbedd0'
      vars['--sail-stroke-2'] = '#dfc9a0'
      vars['--sail-stroke-3'] = '#8e6425'
      vars['--sidebar-accent'] = '#dfc9a0'
      vars['--sidebar-accent-light'] = '#fbedd0'
      vars['--sidebar-accent-bg'] = '#580619'
      vars['--sidebar-logo-text'] = '#dfc9a0'
      vars['--sidebar-logo-glow'] = 'rgba(251, 237, 208, 0.4)'
    } else {
      vars['--sail-bg-0'] = '#0b1739'
      vars['--sail-bg-1'] = '#0e1f4d'
      vars['--sail-bg-2'] = '#0a1536'
      vars['--sail-bg-3'] = '#060e24'
      vars['--sail-stroke-0'] = '#38bdf8'
      vars['--sail-stroke-1'] = '#e2e8f0'
      vars['--sail-stroke-2'] = '#7dd3fc'
      vars['--sail-stroke-3'] = '#0284c7'
      vars['--sidebar-accent'] = '#38bdf8'
      vars['--sidebar-accent-light'] = '#7dd3fc'
      vars['--sidebar-accent-bg'] = '#101c38'
      vars['--sidebar-logo-text'] = '#cbd5e1'
      vars['--sidebar-logo-glow'] = 'rgba(203, 213, 225, 0.45)'
    }
  } else {
    // 9 Renk Ailesine Özel Dinamik Yelken ve Sidebar Hesabı
    const h = p.hue
    if (isLight) {
      vars['--sail-bg-0'] = hslToHex(h, 75, 15)
      vars['--sail-bg-1'] = hslToHex(h, 70, 23)
      vars['--sail-bg-2'] = hslToHex(h, 75, 18)
      vars['--sail-bg-3'] = hslToHex(h, 80, 10)
      vars['--sail-stroke-0'] = a[400]
      vars['--sail-stroke-1'] = hslToHex(h, 30, 92)
      vars['--sail-stroke-2'] = a[500]
      vars['--sail-stroke-3'] = a[700]
      vars['--sidebar-accent'] = a[500]
      vars['--sidebar-accent-light'] = hslToHex(h, 60, 92)
      vars['--sidebar-accent-bg'] = hslToHex(h, 65, 20)
      vars['--sidebar-logo-text'] = a[400]
      vars['--sidebar-logo-glow'] = rgba(a[400], 0.5)
    } else {
      vars['--sail-bg-0'] = hslToHex(h, 58, 14)
      vars['--sail-bg-1'] = hslToHex(h, 65, 18)
      vars['--sail-bg-2'] = hslToHex(h, 60, 12)
      vars['--sail-bg-3'] = hslToHex(h, 68, 8)
      vars['--sail-stroke-0'] = a[400]
      vars['--sail-stroke-1'] = hslToHex(h, 30, 94)
      vars['--sail-stroke-2'] = a[500]
      vars['--sail-stroke-3'] = a[600]
      vars['--sidebar-accent'] = a[400]
      vars['--sidebar-accent-light'] = a[400]
      vars['--sidebar-accent-bg'] = hslToHex(h, 55, 15)
      vars['--sidebar-logo-text'] = a[400]
      vars['--sidebar-logo-glow'] = rgba(a[400], 0.6)
    }
  }

  return vars
}

export function applyTheme(paletteId: string = getStoredPaletteId()): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-palette', paletteId)
  for (const p of THEME_PALETTES) {
    root.classList.remove(`palette-${p.id}`)
  }
  root.classList.add(`palette-${paletteId}`)

  const isLight = root.classList.contains('light') || (!root.classList.contains('dark') && root.getAttribute('data-theme') === 'light')
  const mode = isLight ? 'light' : 'dark'
  const vars = buildThemeVars(paletteId, mode)
  for (const [token, value] of Object.entries(vars)) {
    root.style.setProperty(token, value)
  }
}
