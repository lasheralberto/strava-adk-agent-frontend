import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        'context-card-border': 'var(--context-card-border)',
        'red-800': 'var(--ds-red-800)',
        'red-900': 'var(--ds-red-900)',
        'blue-700': 'var(--ds-blue-700)',
        'amber-800': 'var(--ds-amber-800)',
        'amber-850': 'var(--ds-amber-850)',
        'gray-100': 'var(--ds-gray-100)',
        'gray-400': 'var(--ds-gray-400)',
        'gray-700': 'var(--ds-gray-700)',
        'gray-1000': 'var(--ds-gray-1000)',
        'gray-1000-h': 'var(--ds-gray-1000-h)',
        'gray-alpha-200': 'var(--ds-gray-alpha-200)',
        'gray-alpha-400': 'var(--ds-gray-alpha-400)',
        'background-100': 'var(--ds-background-100)',
        'contrast-fg': 'var(--ds-contrast-fg)',
        'geist-background': 'var(--geist-background)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
      },
      fontSize: {
        caption: ['12px', { lineHeight: '1.35' }],
        footnote: ['13px', { lineHeight: '1.4' }],
        callout: ['14px', { lineHeight: '1.45' }],
        body: ['15px', { lineHeight: '1.5' }],
        'title-2': ['17px', { lineHeight: '1.35', fontWeight: '600' }],
        'title-1': ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        display: ['28px', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em' }],
      },
      transitionDuration: {
        80: '80ms',
        120: '120ms',
        220: '220ms',
        280: '280ms',
      },
      transitionTimingFunction: {
        'design-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      boxShadow: {
        'focus-ring': 'var(--ds-focus-ring)',
        'border-small': 'var(--ds-shadow-border-small)',
        menu: 'var(--ds-shadow-menu)',
      },
      keyframes: {
        'fade-spin': {
          '0%, 39%, 100%': { opacity: '0.2' },
          '40%': { opacity: '1' },
        },
      },
      animation: {
        'fade-spin': 'fade-spin 1.2s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
