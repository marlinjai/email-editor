// examples/nextjs/app/layout.tsx
// Root layout

import { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Email Editor Example',
  description: 'Next.js integration example for @returnhypnosis/email-editor',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

