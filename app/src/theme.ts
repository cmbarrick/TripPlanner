export const colors = {
  brand: '#0f766e',
  brand600: '#0d9488',
  brand100: '#ccfbf1',
  accent: '#f97316',
  accent100: '#ffedd5',
  ink: '#0f172a',
  ink600: '#475569',
  ink400: '#94a3b8',
  line: '#e2e8f0',
  bg: '#f8fafc',
  white: '#ffffff',
  ok: '#16a34a',
  warn: '#d97706',
  danger: '#dc2626',
};

// Gradient pairs for trip cover themes.
export const coverThemes: Record<string, [string, string]> = {
  lisbon: ['#f59e0b', '#ef4444'],
  kyoto: ['#6366f1', '#0ea5e9'],
  alps: ['#0ea5e9', '#14b8a6'],
  sicily: ['#f97316', '#0ea5e9'],
  default: ['#0d9488', '#0f766e'],
};

export const itemAccent: Record<string, string> = {
  Food: '#f97316',
  Lodging: '#6366f1',
  Flight: '#0ea5e9',
  Transport: '#64748b',
  Activity: '#0f766e',
};

export const itemEmoji: Record<string, string> = {
  Food: '🍽',
  Lodging: '🛏',
  Flight: '✈️',
  Transport: '🚇',
  Activity: '🎟',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 22 };
export const space = (n: number) => n * 4;
