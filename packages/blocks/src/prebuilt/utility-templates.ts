// packages/blocks/src/prebuilt/utility-templates.ts
// Pre-built utility templates (signatures, footer, buttons) with ReTurn Hypnosis branding

import type { PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { BRAND, TYPOGRAPHY, CONTENT } from './return-brand';

// ============================================
// SIGNATURE TEMPLATES
// ============================================

/**
 * Signature 1 - Simple name + title
 * Like "John Doe, CEO of Falcon" example
 */
export const signature1Template: PrebuiltTemplate = {
  id: 'signature-1',
  name: 'Signature - Simple',
  category: 'footer',
  description: 'Simple name and title signature',
  section: {
    id: 'signature-1-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '30px', bottom: '30px', left: '30px', right: '30px' },
    columns: [
      {
        id: 'signature-1-col',
        blocks: [
          {
            id: 'signature-1-name',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.h4}color:${BRAND.textDark};font-weight:600;">${CONTENT.ownerName}</p>`,
            align: 'left',
          },
          {
            id: 'signature-1-title',
            type: 'text',
            content: `<p style="margin:4px 0 0 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">${CONTENT.ownerTitle}</p>`,
            align: 'left',
          },
        ],
      },
    ],
  },
};

/**
 * Signature 2 - Centered with signature image
 * Like centered "John Doe" with cursive signature
 */
export const signature2Template: PrebuiltTemplate = {
  id: 'signature-2',
  name: 'Signature - Centered',
  category: 'footer',
  description: 'Centered name with cursive signature style',
  section: {
    id: 'signature-2-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    columns: [
      {
        id: 'signature-2-col',
        blocks: [
          {
            id: 'signature-2-name',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.h4}color:${BRAND.textDark};font-weight:600;">${CONTENT.ownerName}</p>`,
            align: 'center',
          },
          {
            id: 'signature-2-title',
            type: 'text',
            content: `<p style="margin:4px 0 16px 0;${TYPOGRAPHY.caption}color:${BRAND.textLight};">${CONTENT.ownerTitle}</p>`,
            align: 'center',
          },
          {
            id: 'signature-2-cursive',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.signature}color:${BRAND.primary};">Sharon</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Signature 3 - With email and phone
 * Like "Mary Johnson" with contact info
 */
export const signature3Template: PrebuiltTemplate = {
  id: 'signature-3',
  name: 'Signature - With Contact',
  category: 'footer',
  description: 'Name with email and phone contact',
  section: {
    id: 'signature-3-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '30px', bottom: '30px', left: '30px', right: '30px' },
    columns: [
      {
        id: 'signature-3-col',
        blocks: [
          {
            id: 'signature-3-name',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.h4}color:${BRAND.textDark};font-weight:600;">${CONTENT.ownerName}</p>`,
            align: 'center',
          },
          {
            id: 'signature-3-title',
            type: 'text',
            content: `<p style="margin:4px 0 12px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">${CONTENT.ownerTitle}</p>`,
            align: 'center',
          },
          {
            id: 'signature-3-contact',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textLight};">✉ ${CONTENT.ownerEmail}</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Signature 4 - Full signature with closing
 * Like the ReTurn newsletter signature
 */
export const signature4Template: PrebuiltTemplate = {
  id: 'signature-4',
  name: 'Signature - Full',
  category: 'footer',
  description: 'Full signature with closing message',
  section: {
    id: 'signature-4-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px', left: '40px', right: '40px' },
    columns: [
      {
        id: 'signature-4-col',
        blocks: [
          {
            id: 'signature-4-closing',
            type: 'text',
            content: `<p style="margin:0 0 16px 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">${CONTENT.closing.gratitude}</p>`,
            align: 'center',
          },
          {
            id: 'signature-4-name',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.primary};">${CONTENT.ownerName}</p>`,
            align: 'center',
          },
          {
            id: 'signature-4-title',
            type: 'text',
            content: `<p style="margin:8px 0 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:${BRAND.textBody};">${CONTENT.ownerTitle}</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

// ============================================
// BUTTON TEMPLATES
// ============================================

/**
 * Dual Buttons - Two side-by-side CTAs
 * Like "Book tour right now / Save tour for later" example
 */
export const buttonsDualTemplate: PrebuiltTemplate = {
  id: 'buttons-dual',
  name: 'Buttons - Dual CTA',
  category: 'content',
  description: 'Two side-by-side call-to-action buttons',
  section: {
    id: 'buttons-dual-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '30px', bottom: '30px' },
    noStack: true,
    columns: [
      {
        id: 'buttons-dual-col-1',
        width: 50,
        padding: { left: '30px', right: '10px' },
        blocks: [
          {
            id: 'buttons-dual-primary',
            type: 'button',
            label: CONTENT.ctaBookSession,
            href: CONTENT.website,
            align: 'right',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '30px',
            padding: { left: '28px', right: '28px', top: '14px', bottom: '14px' },
          },
        ],
      },
      {
        id: 'buttons-dual-col-2',
        width: 50,
        padding: { left: '10px', right: '30px' },
        blocks: [
          {
            id: 'buttons-dual-secondary',
            type: 'button',
            label: CONTENT.ctaLearnMore,
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.bgWhite,
            color: BRAND.primary,
            borderRadius: '30px',
            border: `2px solid ${BRAND.primary}`,
            padding: { left: '28px', right: '28px', top: '12px', bottom: '12px' },
          },
        ],
      },
    ],
  },
};

/**
 * App Download - App store badges
 * Like the Apple/Google Play example
 */
export const appDownloadTemplate: PrebuiltTemplate = {
  id: 'app-download',
  name: 'App Download',
  category: 'content',
  description: 'App store download badges',
  section: {
    id: 'app-download-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    columns: [
      {
        id: 'app-download-col',
        blocks: [
          {
            id: 'app-download-title',
            type: 'text',
            content: `<p style="margin:0 0 20px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">Download our meditation app:</p>`,
            align: 'center',
          },
          {
            id: 'app-download-badges',
            type: 'image',
            src: 'https://placehold.co/300x44/333333/ffffff?text=App+Store+|+Google+Play',
            alt: 'Download on App Store and Google Play',
            width: '300px',
            align: 'center',
            href: '#',
          },
        ],
      },
    ],
  },
};

// ============================================
// FOOTER TEMPLATES
// ============================================

/**
 * Footer Standard - Newsletter footer with unsubscribe
 * Like the ReTurn newsletter footer
 */
export const footerStandardTemplate: PrebuiltTemplate = {
  id: 'footer-standard',
  name: 'Footer - Standard',
  category: 'footer',
  description: 'Standard newsletter footer with unsubscribe',
  section: {
    id: 'footer-standard-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px', left: '40px', right: '40px' },
    columns: [
      {
        id: 'footer-standard-col',
        blocks: [
          {
            id: 'footer-standard-divider',
            type: 'divider',
            borderColor: BRAND.border,
            borderWidth: '1px',
            borderStyle: 'solid',
            padding: { top: '0px', bottom: '24px' },
          },
          {
            id: 'footer-standard-received',
            type: 'text',
            content: `<p style="margin:0 0 16px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">${CONTENT.footer.received}</p>`,
            align: 'center',
          },
          {
            id: 'footer-standard-unsubscribe',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">${CONTENT.footer.unsubscribe}<br><a href="#" style="color:${BRAND.primary};text-decoration:underline;">${CONTENT.footer.unsubscribeLink}</a>.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Footer with Social - Footer including social icons
 */
export const footerSocialTemplate: PrebuiltTemplate = {
  id: 'footer-social',
  name: 'Footer - With Social',
  category: 'footer',
  description: 'Footer with social media icons',
  section: {
    id: 'footer-social-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    columns: [
      {
        id: 'footer-social-col',
        blocks: [
          {
            id: 'footer-social-icons',
            type: 'social',
            mode: 'horizontal',
            iconSize: '28px',
            iconPadding: '8px',
            links: [
              { platform: 'facebook', url: 'https://facebook.com' },
              { platform: 'instagram', url: 'https://instagram.com' },
              { platform: 'youtube', url: 'https://youtube.com' },
            ],
          },
          {
            id: 'footer-social-divider',
            type: 'divider',
            borderColor: BRAND.border,
            borderWidth: '1px',
            borderStyle: 'solid',
            padding: { top: '24px', bottom: '24px' },
          },
          {
            id: 'footer-social-company',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textLight};">${CONTENT.companyName}</p>`,
            align: 'center',
          },
          {
            id: 'footer-social-copyright',
            type: 'text',
            content: `<p style="margin:8px 0 0 0;${TYPOGRAPHY.caption}color:${BRAND.textLight};">© 2025 All rights reserved.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Footer Links - Footer with navigation links
 */
export const footerLinksTemplate: PrebuiltTemplate = {
  id: 'footer-links',
  name: 'Footer - With Links',
  category: 'footer',
  description: 'Footer with navigation and contact info',
  section: {
    id: 'footer-links-section',
    type: 'section',
    backgroundColor: BRAND.primaryDark,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'footer-links-col-1',
        width: 50,
        padding: { left: '30px', right: '20px' },
        blocks: [
          {
            id: 'footer-links-phone',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:rgba(255,255,255,0.8);">Contact</p>`,
            align: 'left',
          },
          {
            id: 'footer-links-email',
            type: 'text',
            content: `<p style="margin:8px 0 0 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textWhite};">${CONTENT.ownerEmail}</p>`,
            align: 'left',
          },
        ],
      },
      {
        id: 'footer-links-col-2',
        width: 50,
        padding: { left: '20px', right: '30px' },
        blocks: [
          {
            id: 'footer-links-copyright',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:rgba(255,255,255,0.6);">© 2025 ${CONTENT.companyName}</p>`,
            align: 'right',
          },
          {
            id: 'footer-links-legal',
            type: 'text',
            content: `<p style="margin:8px 0 0 0;${TYPOGRAPHY.caption}color:rgba(255,255,255,0.8);"><a href="#" style="color:rgba(255,255,255,0.8);">Privacy</a> | <a href="#" style="color:rgba(255,255,255,0.8);">Unsubscribe</a></p>`,
            align: 'right',
          },
        ],
      },
    ],
  },
};

export const utilityTemplates = [
  signature1Template,
  signature2Template,
  signature3Template,
  signature4Template,
  buttonsDualTemplate,
  appDownloadTemplate,
  footerStandardTemplate,
  footerSocialTemplate,
  footerLinksTemplate,
];

