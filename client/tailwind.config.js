/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'surface-tint':             'rgb(var(--tb-surface-tint) / <alpha-value>)',
        'inverse-primary':          'rgb(var(--tb-inverse-primary) / <alpha-value>)',
        'surface-dim':              'rgb(var(--tb-surface-dim) / <alpha-value>)',
        'error-container':          'rgb(var(--tb-error-container) / <alpha-value>)',
        'primary':                  'rgb(var(--tb-primary) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--tb-surface-container-lowest) / <alpha-value>)',
        'secondary-fixed-dim':      'rgb(var(--tb-secondary-fixed-dim) / <alpha-value>)',
        'inverse-surface':          'rgb(var(--tb-inverse-surface) / <alpha-value>)',
        'surface-variant':          'rgb(var(--tb-surface-variant) / <alpha-value>)',
        'surface-container':        'rgb(var(--tb-surface-container) / <alpha-value>)',
        'on-error':                 'rgb(var(--tb-on-error) / <alpha-value>)',
        'outline':                  'rgb(var(--tb-outline) / <alpha-value>)',
        'tertiary-fixed':           'rgb(var(--tb-tertiary-fixed) / <alpha-value>)',
        'error':                    'rgb(var(--tb-error) / <alpha-value>)',
        'outline-variant':          'rgb(var(--tb-outline-variant) / <alpha-value>)',
        'on-error-container':       'rgb(var(--tb-on-error-container) / <alpha-value>)',
        'on-background':            'rgb(var(--tb-on-background) / <alpha-value>)',
        'on-primary':               'rgb(var(--tb-on-primary) / <alpha-value>)',
        'primary-container':        'rgb(var(--tb-primary-container) / <alpha-value>)',
        'on-primary-container':     'rgb(var(--tb-on-primary-container) / <alpha-value>)',
        'surface-bright':           'rgb(var(--tb-surface-bright) / <alpha-value>)',
        'on-surface':               'rgb(var(--tb-on-surface) / <alpha-value>)',
        'secondary':                'rgb(var(--tb-secondary) / <alpha-value>)',
        'secondary-container':      'rgb(var(--tb-secondary-container) / <alpha-value>)',
        'on-secondary':             'rgb(var(--tb-on-secondary) / <alpha-value>)',
        'on-secondary-container':   'rgb(var(--tb-on-secondary-container) / <alpha-value>)',
        'surface-container-high':   'rgb(var(--tb-surface-container-high) / <alpha-value>)',
        'surface':                  'rgb(var(--tb-surface) / <alpha-value>)',
        'background':               'rgb(var(--tb-background) / <alpha-value>)',
        'surface-container-low':    'rgb(var(--tb-surface-container-low) / <alpha-value>)',
        'on-surface-variant':       'rgb(var(--tb-on-surface-variant) / <alpha-value>)',
        'inverse-on-surface':       'rgb(var(--tb-inverse-on-surface) / <alpha-value>)',
        'tertiary':                 'rgb(var(--tb-tertiary) / <alpha-value>)',
        'tertiary-container':       'rgb(var(--tb-tertiary-container) / <alpha-value>)',
        'success':                  'rgb(var(--tb-success) / <alpha-value>)',
        'on-success':               'rgb(var(--tb-on-success) / <alpha-value>)',
        'success-container':        'rgb(var(--tb-success-container) / <alpha-value>)',
        'on-success-container':     'rgb(var(--tb-on-success-container) / <alpha-value>)',
        'warning':                  'rgb(var(--tb-warning) / <alpha-value>)',
        'on-warning':               'rgb(var(--tb-on-warning) / <alpha-value>)',
        'warning-container':        'rgb(var(--tb-warning-container) / <alpha-value>)',
        'on-warning-container':     'rgb(var(--tb-on-warning-container) / <alpha-value>)',
      },
      spacing: {
        'container-padding': '40px',
        'inline-gap-sm': '12px',
        'card-padding': '32px',
        'grid-gutter': '24px',
        'stack-gap-md': '24px',
        'stack-gap-lg': '32px',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        'display-lg': ['Plus Jakarta Sans', 'sans-serif'],
        'headline-lg': ['Plus Jakarta Sans', 'sans-serif'],
        'headline-md': ['Plus Jakarta Sans', 'sans-serif'],
        'body-lg': ['Plus Jakarta Sans', 'sans-serif'],
        'body-md': ['Plus Jakarta Sans', 'sans-serif'],
        'label-md': ['Plus Jakarta Sans', 'sans-serif'],
        'label-sm': ['Plus Jakarta Sans', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-lg-mobile': ['28px', { lineHeight: '1.2', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '500' }],
        'body-md': ['15px', { lineHeight: '1.5', fontWeight: '500' }],
        'label-md': ['13px', { lineHeight: '1.4', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '1.2', letterSpacing: '0.05em', fontWeight: '700' }],
      },
      boxShadow: {
        soft: '0px 4px 20px rgba(0, 0, 0, 0.03)',
        heavy: '0px 12px 32px rgba(0, 0, 0, 0.08)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
    // `can-hover:` — only applies on devices with a real hover pointer (mouse/trackpad).
    // Lets hover-revealed actions stay permanently visible on touch screens.
    require('tailwindcss/plugin')(({ addVariant }) =>
      addVariant('can-hover', '@media (hover: hover) and (pointer: fine)')
    ),
    // `mono-light:` — only in the light Mono palette, whose surfaces are all
    // pure white (so the default surface-container hover is invisible). Lets
    // us add a faint tint just there without touching the other palettes.
    require('tailwindcss/plugin')(({ addVariant }) =>
      addVariant('mono-light', '[data-palette="mono"]:not(.dark) &')
    ),
  ],
};
