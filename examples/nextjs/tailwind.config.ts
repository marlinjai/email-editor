// examples/nextjs/tailwind.config.ts
// Tailwind configuration for Next.js example

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // Include editor packages
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/editor/src/**/*.{ts,tsx}',
  ],
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

export default config;

