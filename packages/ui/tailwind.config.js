// packages/ui/tailwind.config.js
// Tailwind configuration for email editor UI

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: {
          1: 'var(--midnight-1)',
          2: 'var(--midnight-2)',
          3: 'var(--midnight-3)',
          4: 'var(--midnight-4)',
        },
        canvas: {
          1: 'var(--canvas-1)',
          2: 'var(--canvas-2)',
          3: 'var(--canvas-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          muted: 'var(--accent-muted)',
        },
        'border-default': 'var(--border-default)',
        'border-subtle': 'var(--border-subtle)',
        'border-light': 'var(--border-light)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-dark': 'var(--text-dark)',
        'text-dark-muted': 'var(--text-dark-muted)',
        success: {
          DEFAULT: 'var(--success)',
          muted: 'var(--success-muted)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          muted: 'var(--danger-muted)',
        },
        brand: {
          primary: 'var(--accent)',
          surface: 'var(--canvas-2)',
          border: 'var(--border-light)',
          text: 'var(--text-dark)',
          'text-secondary': 'var(--text-dark-muted)',
        },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
