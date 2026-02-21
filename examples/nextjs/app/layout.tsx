// examples/nextjs/app/layout.tsx
// Root layout

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Email Editor - Visual Email Builder',
  description: 'A standalone, pluggable email editor built with MJML, React, and TypeScript. Drag-and-drop blocks, live preview, and one-click export to email-safe HTML.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
