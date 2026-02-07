// packages/blocks/src/prebuilt/return-brand.ts
// ReTurn Hypnosis brand constants for email templates

/**
 * ReTurn Hypnosis Brand Color Palette
 * Derived from returnhypnosis.com
 */
export const BRAND = {
  // Primary colors
  primary: '#944923',        // Brown/rust - main accent
  primaryDark: '#5C3D2E',    // Dark brown - text
  primaryLight: '#D4A574',   // Gold accent
  
  // Background colors
  bgCream: '#F7F3EE',        // Main background
  bgWhite: '#FFFFFF',        // White sections
  bgLight: '#FAF8F5',        // Slightly darker cream
  
  // Text colors
  textDark: '#5C3D2E',       // Dark brown for headings
  textBody: '#666666',       // Gray for body text
  textLight: '#999999',      // Light text for captions
  textWhite: '#FFFFFF',      // White text on dark bg
  
  // Border & divider
  border: '#E8E2DB',         // Subtle cream border
  divider: '#D4A574',        // Gold divider
} as const;

/**
 * Typography styles using Cormorant Garamond
 * Note: MJML requires inline styles, these are helpers
 */
export const TYPOGRAPHY = {
  // Heading styles - Cormorant Garamond (serif, italic)
  h1: 'font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-weight: 600; font-size: 36px; line-height: 1.2;',
  h2: 'font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-weight: 600; font-size: 28px; line-height: 1.3;',
  h3: 'font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-weight: 500; font-size: 22px; line-height: 1.4;',
  h4: 'font-family: "Cormorant Garamond", Georgia, serif; font-weight: 500; font-size: 18px; line-height: 1.4;',
  
  // Body styles - Open Sans / system
  body: 'font-family: "Open Sans", -apple-system, sans-serif; font-size: 16px; line-height: 1.6;',
  bodySmall: 'font-family: "Open Sans", -apple-system, sans-serif; font-size: 14px; line-height: 1.5;',
  caption: 'font-family: "Open Sans", -apple-system, sans-serif; font-size: 12px; line-height: 1.4;',
  
  // Special styles
  signature: 'font-family: "Cormorant Garamond", Georgia, serif; font-style: italic; font-size: 24px;',
  label: 'font-family: "Open Sans", -apple-system, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;',
} as const;

/**
 * Common content for ReTurn Hypnosis templates
 */
export const CONTENT = {
  // Branding
  companyName: 'ReTurn Hypnotherapy',
  tagline: 'Personal transformation through regression hypnosis',
  
  // Owner info
  ownerName: 'Sharon Di Salvo',
  ownerTitle: 'Certified Regression Hypnotherapist',
  ownerEmail: 'sharon@returnhypnosis.com',
  
  // Common CTAs
  ctaBookSession: 'Book a Session',
  ctaLearnMore: 'Learn More',
  ctaReadMore: 'Read More',
  ctaGetStarted: 'Begin Your Journey',
  ctaExplore: 'Explore More',
  
  // Headlines
  headlines: [
    'Begin Your Journey Within',
    'Discover Your Inner Wisdom',
    'Transform Your Life Today',
    'Clarity. Resolution. Confidence.',
    'The Adventure of a Lifetime',
  ],
  
  // Common body text
  bodyText: {
    intro: 'A hypnotherapy session is truly the adventure of a lifetime, through which you can access earlier moments in this life, or if it aligns with your belief system, past lives.',
    destination: 'But no matter where you go, the destination is always the same: Clarity. Resolution. Confidence in the Now.',
    welcome: 'Thank you for joining the ReTurn community. Here you\'ll find insights, guidance, and inspiration for your personal transformation journey.',
  },
  
  // Closing
  closing: {
    gratitude: 'With gratitude and warmth,',
    signature: 'Sharon Di Salvo',
  },
  
  // Footer
  footer: {
    unsubscribe: 'If you no longer wish to receive these emails, you can',
    unsubscribeLink: 'unsubscribe here',
    received: 'You received this email because you subscribed to Sharon Di Salvo\'s newsletter.',
  },
  
  // Logo URL (placeholder - user should replace)
  logoUrl: 'https://placehold.co/120x120/F7F3EE/944923?text=R',
  
  // Website
  website: 'https://returnhypnosis.com',
} as const;

/**
 * Helper function to create styled heading HTML
 */
export function styledHeading(text: string, level: 1 | 2 | 3 | 4 = 1): string {
  const tag = `h${level}`;
  const style = TYPOGRAPHY[`h${level}` as keyof typeof TYPOGRAPHY];
  return `<${tag} style="margin:0;${style}color:${BRAND.textDark};">${text}</${tag}>`;
}

/**
 * Helper function to create styled body text HTML
 */
export function styledBody(text: string, centered = false): string {
  const align = centered ? 'text-align:center;' : '';
  return `<p style="margin:0;${TYPOGRAPHY.body}color:${BRAND.textBody};${align}">${text}</p>`;
}

/**
 * Helper function to create styled label HTML
 */
export function styledLabel(text: string): string {
  return `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">${text}</p>`;
}

