// packages/ui/tailwind.config.js
// Tailwind configuration for email editor UI

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // Every rule in the built stylesheet is scoped under .ee-root by
  // postcss-scope.cjs, including this reset, so it never touches the host page.
  theme: {
    extend: {
      colors: {
        midnight: {
          1: 'var(--ee-midnight-1)',
          2: 'var(--ee-midnight-2)',
          3: 'var(--ee-midnight-3)',
          4: 'var(--ee-midnight-4)',
        },
        canvas: {
          1: 'var(--ee-canvas-1)',
          2: 'var(--ee-canvas-2)',
          3: 'var(--ee-canvas-3)',
        },
        accent: {
          DEFAULT: 'var(--ee-accent)',
          hover: 'var(--ee-accent-hover)',
          muted: 'var(--ee-accent-muted)',
        },
        'border-default': 'var(--ee-border-default)',
        'border-subtle': 'var(--ee-border-subtle)',
        'border-light': 'var(--ee-border-light)',
        'text-primary': 'var(--ee-text-primary)',
        'text-secondary': 'var(--ee-text-secondary)',
        'text-tertiary': 'var(--ee-text-tertiary)',
        'text-dark': 'var(--ee-text-dark)',
        'text-dark-muted': 'var(--ee-text-dark-muted)',
        success: {
          DEFAULT: 'var(--ee-success)',
          muted: 'var(--ee-success-muted)',
        },
        danger: {
          DEFAULT: 'var(--ee-danger)',
          muted: 'var(--ee-danger-muted)',
        },
        brand: {
          primary: 'var(--ee-accent)',
          surface: 'var(--ee-canvas-2)',
          border: 'var(--ee-border-light)',
          text: 'var(--ee-text-dark)',
          'text-secondary': 'var(--ee-text-dark-muted)',
        },
      },
      fontFamily: {
        sans: ['var(--ee-font-sans)'],
      },
    },
  },
  plugins: [],
};
