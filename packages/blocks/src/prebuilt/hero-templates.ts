// packages/blocks/src/prebuilt/hero-templates.ts
// Pre-built hero section templates with ReTurn Hypnosis branding

import type { PrebuiltTemplate } from '@returnhypnosis/email-editor-core';
import { BRAND, TYPOGRAPHY, CONTENT } from './return-brand';

/**
 * Hero Main - Full-width with background image
 * Inspired by returnhypnosis.com homepage hero
 */
export const heroMainTemplate: PrebuiltTemplate = {
  id: 'hero-main',
  name: 'Hero - Main',
  category: 'hero',
  description: 'Full-width hero with background image and CTA',
  section: {
    id: 'hero-main-section',
    type: 'section',
    backgroundColor: BRAND.primary,
    backgroundImage: 'https://placehold.co/1200x500/944923/ffffff?text=Hero+Background',
    padding: { top: '80px', bottom: '80px' },
    columns: [
      {
        id: 'hero-main-col',
        blocks: [
          {
            id: 'hero-main-title',
            type: 'text',
            content: `<h1 style="margin:0;${TYPOGRAPHY.h1}color:${BRAND.textWhite};">Begin Your Journey Within</h1>`,
            align: 'center',
          },
          {
            id: 'hero-main-subtitle',
            type: 'text',
            content: `<p style="margin:20px 0 32px 0;${TYPOGRAPHY.body}color:${BRAND.textWhite};">${CONTENT.tagline}</p>`,
            align: 'center',
          },
          {
            id: 'hero-main-button',
            type: 'button',
            label: CONTENT.ctaBookSession,
            href: CONTENT.website,
            align: 'center',
            backgroundColor: BRAND.bgWhite,
            color: BRAND.primary,
            borderRadius: '30px',
            padding: { left: '32px', right: '32px', top: '14px', bottom: '14px' },
          },
        ],
      },
    ],
  },
};

/**
 * Hero Newsletter Header - Centered logo + welcome
 * Based on the newsletter header screenshot provided
 */
export const heroNewsletterTemplate: PrebuiltTemplate = {
  id: 'hero-newsletter',
  name: 'Hero - Newsletter Header',
  category: 'hero',
  description: 'Centered logo with welcome headline for newsletters',
  section: {
    id: 'hero-newsletter-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '50px', bottom: '40px' },
    columns: [
      {
        id: 'hero-newsletter-col',
        blocks: [
          {
            id: 'hero-newsletter-logo',
            type: 'image',
            src: CONTENT.logoUrl,
            alt: 'ReTurn Hypnotherapy Logo',
            width: '120px',
            align: 'center',
          },
          {
            id: 'hero-newsletter-title',
            type: 'text',
            content: `<h1 style="margin:30px 0 16px 0;${TYPOGRAPHY.h1}color:${BRAND.textDark};">Welcome to the ReTurn Newsletter</h1>`,
            align: 'center',
          },
          {
            id: 'hero-newsletter-tagline',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.primary};">${CONTENT.tagline}</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Hero Minimal - Clean with divider
 */
export const heroMinimalTemplate: PrebuiltTemplate = {
  id: 'hero-minimal',
  name: 'Hero - Minimal',
  category: 'hero',
  description: 'Clean minimal hero with divider',
  section: {
    id: 'hero-minimal-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '50px', bottom: '40px' },
    columns: [
      {
        id: 'hero-minimal-col',
        blocks: [
          {
            id: 'hero-minimal-title',
            type: 'text',
            content: `<h1 style="margin:0;${TYPOGRAPHY.h1}color:${BRAND.textDark};">Discover Your Inner Wisdom</h1>`,
            align: 'center',
          },
          {
            id: 'hero-minimal-divider',
            type: 'divider',
            borderColor: BRAND.divider,
            borderWidth: '2px',
            borderStyle: 'solid',
            padding: { top: '24px', bottom: '24px' },
          },
          {
            id: 'hero-minimal-text',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.body}color:${BRAND.textBody};">${CONTENT.bodyText.destination}</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Hero Split - Image and text side by side
 */
export const heroSplitTemplate: PrebuiltTemplate = {
  id: 'hero-split',
  name: 'Hero - Split',
  category: 'hero',
  description: 'Hero with image and text side by side',
  section: {
    id: 'hero-split-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'hero-split-text-col',
        width: 50,
        verticalAlign: 'middle',
        padding: { right: '20px' },
        blocks: [
          {
            id: 'hero-split-label',
            type: 'text',
            content: `<p style="margin:0 0 12px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">HYPNOTHERAPY</p>`,
            align: 'left',
          },
          {
            id: 'hero-split-title',
            type: 'text',
            content: `<h1 style="margin:0;${TYPOGRAPHY.h1}color:${BRAND.textDark};">The Adventure of a Lifetime</h1>`,
            align: 'left',
          },
          {
            id: 'hero-split-desc',
            type: 'text',
            content: `<p style="margin:20px 0 28px 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">${CONTENT.bodyText.intro}</p>`,
            align: 'left',
          },
          {
            id: 'hero-split-button',
            type: 'button',
            label: CONTENT.ctaLearnMore,
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '30px',
            padding: { left: '28px', right: '28px', top: '12px', bottom: '12px' },
          },
        ],
      },
      {
        id: 'hero-split-image-col',
        width: 50,
        blocks: [
          {
            id: 'hero-split-image',
            type: 'image',
            src: 'https://placehold.co/400x350/E8E2DB/944923?text=Session+Image',
            alt: 'Hypnotherapy session',
            width: '100%',
            align: 'center',
            borderRadius: '8px',
          },
        ],
      },
    ],
  },
};

export const heroTemplates = [
  heroMainTemplate,
  heroNewsletterTemplate,
  heroMinimalTemplate,
  heroSplitTemplate,
];
