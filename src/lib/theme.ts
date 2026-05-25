// =========================================
// Trajet — Design tokens
// =========================================
//
// Estratégia de tema:
// - `colors` é um objeto mutável (compatibilidade com código existente)
// - `applyTheme()` sobrescreve `colors` via Object.assign
// - `ThemeProvider` remonta a árvore via `key` quando tema muda
//   (isso força todos os StyleSheet.create a rerodar com as novas cores)
//
// Outras escalas (spacing, radius, etc.) não mudam entre temas.
// =========================================

// ── Paleta DARK ──────────────────────────────────────────────────

const colorsDark = {
  bg: '#0a0e1a',
  bgElevated: '#0f1424',
  surface: '#161c2e',
  surfaceAlt: '#1f2742',
  surfaceHover: '#252e4a',
  surfacePremium: '#1a2138',

  border: '#2a3349',
  borderStrong: '#3a4566',
  borderSubtle: '#1e2538',

  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textDisabled: '#64748b',

  primary: '#7b2fff',
  primaryHover: '#6320d4',
  primarySoft: 'rgba(123, 47, 255, 0.18)',
  primarySofter: 'rgba(123, 47, 255, 0.09)',
  primaryGlow: 'rgba(123, 47, 255, 0.28)',
  primaryTextOnSolid: '#ffffff',

  success: '#10b981',
  successSoft: '#064e3b',    // sólido escuro pra legibilidade
  successGlow: 'rgba(16, 185, 129, 0.25)',
  warning: '#f59e0b',
  warningSoft: '#451a03',    // sólido escuro
  warningGlow: 'rgba(245, 158, 11, 0.25)',
  danger: '#ef4444',
  dangerSoft: '#450a0a',     // sólido escuro
  dangerGlow: 'rgba(239, 68, 68, 0.25)',
  info: '#3b82f6',
  infoSoft: 'rgba(59, 130, 246, 0.12)',

  overlay: 'rgba(0, 0, 0, 0.65)',
  shimmer: 'rgba(255, 255, 255, 0.06)',
  gradientPremiumTop: '#1d2540',
  gradientPremiumBot: '#161c2e',
};

// ── Paleta LIGHT ─────────────────────────────────────────────────

const colorsLight: typeof colorsDark = {
  bg: '#f5f7fa',
  bgElevated: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f0f3f8',
  surfaceHover: '#e8edf4',
  surfacePremium: '#ffffff',

  border: '#dde3ed',
  borderStrong: '#c4cdd9',
  borderSubtle: '#eaeff6',

  text: '#0d1117',
  textSecondary: '#2d3a4e',
  textMuted: '#576175',
  textDisabled: '#8a96a8',

  primary: '#7b2fff',
  primaryHover: '#6320d4',
  primarySoft: 'rgba(123, 47, 255, 0.14)',
  primarySofter: 'rgba(123, 47, 255, 0.07)',
  primaryGlow: 'rgba(123, 47, 255, 0.20)',
  primaryTextOnSolid: '#ffffff',

  success: '#059669',
  successSoft: '#dcfce7',    // sólido claro
  successGlow: 'rgba(5, 150, 105, 0.20)',
  warning: '#d97706',
  warningSoft: '#fef3c7',    // sólido claro
  warningGlow: 'rgba(217, 119, 6, 0.20)',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',     // sólido claro
  dangerGlow: 'rgba(220, 38, 38, 0.20)',
  info: '#2563eb',
  infoSoft: 'rgba(37, 99, 235, 0.10)',

  overlay: 'rgba(0, 0, 0, 0.45)',
  shimmer: 'rgba(0, 0, 0, 0.05)',
  gradientPremiumTop: '#ffffff',
  gradientPremiumBot: '#f0f3f8',
};

// ── Cores mutáveis (compatibilidade) ─────────────────────────────

export const colors = { ...colorsDark };

export type ThemeMode = 'dark' | 'light';
export type ColorPalette = typeof colorsDark;

let currentMode: ThemeMode = 'dark';

export function applyTheme(mode: ThemeMode): void {
  currentMode = mode;
  const palette = mode === 'light' ? colorsLight : colorsDark;
  Object.assign(colors, palette);
}

export function getCurrentTheme(): ThemeMode {
  return currentMode;
}

/**
 * Retorna a paleta para um dado modo.
 * Útil quando precisa da paleta sem modificar o objeto global.
 */
export function getPalette(mode: ThemeMode): ColorPalette {
  return mode === 'light' ? { ...colorsLight } : { ...colorsDark };
}

// ── Tokens estáticos ─────────────────────────────────────────────

export const spacing = {
  xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24,
  xxl: 32, xxxl: 48, huge: 64,
} as const;

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 20, xxl: 28, pill: 999,
} as const;

export const fontSize = {
  xs: 11, sm: 13, md: 15, lg: 18, xl: 22,
  xxl: 28, xxxl: 36, xxxxl: 44,
} as const;

export const letterSpacing = {
  tight: -0.5, tighter: -0.8, normal: 0,
  wide: 0.3, wider: 1.2, widest: 1.8,
} as const;

export const lineHeight = {
  tight: 1.15, snug: 1.3, normal: 1.5, relaxed: 1.65,
} as const;

export const fontWeight = {
  regular: '400', medium: '500', semibold: '600', bold: '700',
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  primaryGlow: {
    shadowColor: '#7b2fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryGlowStrong: {
    shadowColor: '#7b2fff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export const easing = {
  decelerate: [0.0, 0.0, 0.2, 1] as [number, number, number, number],
  accelerate: [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
  standard: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
} as const;
