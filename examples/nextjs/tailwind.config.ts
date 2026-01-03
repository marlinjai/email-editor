// examples/nextjs/tailwind.config.ts
// Tailwind configuration for Next.js example

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // Include editor UI components
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#944923',
        'brand-surface': '#ffffff',
        'brand-text': '#1a1a1a',
        'brand-text-secondary': '#666666',
        'brand-border': '#e5e5e5',
      },
      fontFamily: {
        serif: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;

