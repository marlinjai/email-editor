// packages/ui/tailwind.config.js
// Tailwind configuration for email editor UI

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#944923',
          surface: '#ffffff',
          border: '#e5e5e5',
          text: '#1a1a1a',
          'text-secondary': '#666666',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

