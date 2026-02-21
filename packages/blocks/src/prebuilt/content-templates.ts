// packages/blocks/src/prebuilt/content-templates.ts
// Pre-built content section templates with ReTurn Hypnosis branding

import type { PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { BRAND, TYPOGRAPHY, CONTENT } from './return-brand';

/**
 * Text + Image Right - Image on the right side
 * Like "Hiking Sequoia" example in Mailjet
 */
export const textImageRightTemplate: PrebuiltTemplate = {
  id: 'text-image-right',
  name: 'Text + Image Right',
  category: 'content',
  description: 'Text block with image on the right',
  section: {
    id: 'text-image-right-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'text-image-right-text-col',
        width: 55,
        verticalAlign: 'middle',
        padding: { right: '24px' },
        blocks: [
          {
            id: 'text-image-right-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">YOUR JOURNEY</p>`,
            align: 'left',
          },
          {
            id: 'text-image-right-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h2}color:${BRAND.textDark};">Discover the Path to Inner Peace</h2>`,
            align: 'left',
          },
          {
            id: 'text-image-right-body',
            type: 'text',
            content: `<p style="margin:16px 0 0 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">Through regression hypnotherapy, you can explore the root causes of current challenges, release old patterns, and step into a more empowered version of yourself.</p>`,
            align: 'left',
          },
        ],
      },
      {
        id: 'text-image-right-image-col',
        width: 45,
        blocks: [
          {
            id: 'text-image-right-image',
            type: 'image',
            src: 'https://placehold.co/350x280/E8E2DB/944923?text=Journey+Image',
            alt: 'Your journey image',
            width: '100%',
            align: 'center',
            borderRadius: '8px',
          },
        ],
      },
    ],
  },
};

/**
 * Text + Image Left - Image on the left side
 * Like "Trail to Machu Picchu" example in Mailjet
 */
export const textImageLeftTemplate: PrebuiltTemplate = {
  id: 'text-image-left',
  name: 'Text + Image Left',
  category: 'content',
  description: 'Text block with image on the left',
  section: {
    id: 'text-image-left-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'text-image-left-image-col',
        width: 45,
        blocks: [
          {
            id: 'text-image-left-image',
            type: 'image',
            src: 'https://placehold.co/350x280/944923/F7F3EE?text=Session+Image',
            alt: 'Session image',
            width: '100%',
            align: 'center',
            borderRadius: '8px',
          },
        ],
      },
      {
        id: 'text-image-left-text-col',
        width: 55,
        verticalAlign: 'middle',
        padding: { left: '24px' },
        blocks: [
          {
            id: 'text-image-left-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">THE SESSION</p>`,
            align: 'left',
          },
          {
            id: 'text-image-left-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h2}color:${BRAND.textDark};">What to Expect</h2>`,
            align: 'left',
          },
          {
            id: 'text-image-left-body',
            type: 'text',
            content: `<p style="margin:16px 0 0 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">Each session is a safe, guided exploration tailored to your unique needs. You'll be in a relaxed state while remaining fully aware and in control throughout the experience.</p>`,
            align: 'left',
          },
        ],
      },
    ],
  },
};

/**
 * Section Title 1 - Simple centered headline with body
 * Like "The Scottish Highlands" example
 */
export const sectionTitle1Template: PrebuiltTemplate = {
  id: 'section-title-1',
  name: 'Section Title - Simple',
  category: 'content',
  description: 'Centered headline with body text',
  section: {
    id: 'section-title-1-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px', left: '40px', right: '40px' },
    columns: [
      {
        id: 'section-title-1-col',
        blocks: [
          {
            id: 'section-title-1-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h2}color:${BRAND.textDark};">The Journey of Self-Discovery</h2>`,
            align: 'left',
          },
          {
            id: 'section-title-1-divider',
            type: 'divider',
            borderColor: BRAND.primary,
            borderWidth: '2px',
            borderStyle: 'solid',
            padding: { top: '16px', bottom: '16px' },
            width: '60px',
          },
          {
            id: 'section-title-1-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.body}color:${BRAND.textBody};">Regression hypnotherapy opens doors to profound self-understanding. By accessing memories and experiences from your past, you can gain clarity about patterns that shape your present life.</p>`,
            align: 'left',
          },
        ],
      },
    ],
  },
};

/**
 * Section Title 2 - With button
 * Like "Scottish Highlands with Buy now" example
 */
export const sectionTitle2Template: PrebuiltTemplate = {
  id: 'section-title-2',
  name: 'Section Title - With Button',
  category: 'content',
  description: 'Headline with body text and CTA button',
  section: {
    id: 'section-title-2-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px', left: '40px', right: '40px' },
    columns: [
      {
        id: 'section-title-2-col',
        blocks: [
          {
            id: 'section-title-2-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h2}color:${BRAND.textDark};">Ready to Begin?</h2>`,
            align: 'left',
          },
          {
            id: 'section-title-2-divider',
            type: 'divider',
            borderColor: BRAND.primary,
            borderWidth: '2px',
            borderStyle: 'solid',
            padding: { top: '16px', bottom: '16px' },
            width: '60px',
          },
          {
            id: 'section-title-2-body',
            type: 'text',
            content: `<p style="margin:0 0 24px 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">Take the first step toward transformation. Book a complimentary consultation to discuss your goals and learn how regression hypnotherapy can help you.</p>`,
            align: 'left',
          },
          {
            id: 'section-title-2-button',
            type: 'button',
            label: CONTENT.ctaBookSession,
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '30px',
            padding: { left: '28px', right: '28px', top: '12px', bottom: '12px' },
          },
        ],
      },
    ],
  },
};

/**
 * Section Title 3 - Colored background
 * Like red "Other Adventure Styles" example
 */
export const sectionTitle3Template: PrebuiltTemplate = {
  id: 'section-title-3',
  name: 'Section Title - Colored',
  category: 'content',
  description: 'Headline with colored background strip',
  section: {
    id: 'section-title-3-section',
    type: 'section',
    backgroundColor: BRAND.primary,
    padding: { top: '30px', bottom: '30px', left: '40px', right: '40px' },
    columns: [
      {
        id: 'section-title-3-col',
        blocks: [
          {
            id: 'section-title-3-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h2}color:${BRAND.textWhite};">Explore More Sessions</h2>`,
            align: 'center',
          },
          {
            id: 'section-title-3-body',
            type: 'text',
            content: `<p style="margin:12px 0 0 0;${TYPOGRAPHY.body}color:rgba(255,255,255,0.9);">Discover the different types of regression hypnotherapy available.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Quote Block - Testimonial or inspirational quote
 */
export const quoteBlockTemplate: PrebuiltTemplate = {
  id: 'quote-block',
  name: 'Quote Block',
  category: 'content',
  description: 'Centered quote with attribution',
  section: {
    id: 'quote-block-section',
    type: 'section',
    backgroundColor: BRAND.bgLight,
    padding: { top: '50px', bottom: '50px', left: '60px', right: '60px' },
    columns: [
      {
        id: 'quote-block-col',
        blocks: [
          {
            id: 'quote-block-text',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">"The journey of a thousand miles begins with a single step. Your transformation starts the moment you decide to look within."</p>`,
            align: 'center',
          },
          {
            id: 'quote-block-divider',
            type: 'divider',
            borderColor: BRAND.divider,
            borderWidth: '1px',
            borderStyle: 'solid',
            padding: { top: '24px', bottom: '24px' },
            width: '80px',
          },
          {
            id: 'quote-block-attribution',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.bodySmall}color:${BRAND.primary};">— ${CONTENT.ownerName}</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Simple Divider Section
 */
export const dividerSectionTemplate: PrebuiltTemplate = {
  id: 'divider-section',
  name: 'Divider',
  category: 'content',
  description: 'Simple decorative divider',
  section: {
    id: 'divider-section-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '20px', bottom: '20px' },
    columns: [
      {
        id: 'divider-section-col',
        blocks: [
          {
            id: 'divider-section-divider',
            type: 'divider',
            borderColor: BRAND.border,
            borderWidth: '1px',
            borderStyle: 'solid',
          },
        ],
      },
    ],
  },
};

/**
 * Spacer Section
 */
export const spacerSectionTemplate: PrebuiltTemplate = {
  id: 'spacer-section',
  name: 'Spacer',
  category: 'content',
  description: 'Empty space between sections',
  section: {
    id: 'spacer-section-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '0px', bottom: '0px' },
    columns: [
      {
        id: 'spacer-section-col',
        blocks: [
          {
            id: 'spacer-section-spacer',
            type: 'spacer',
            height: '40px',
          },
        ],
      },
    ],
  },
};

export const contentTemplates = [
  textImageRightTemplate,
  textImageLeftTemplate,
  sectionTitle1Template,
  sectionTitle2Template,
  sectionTitle3Template,
  quoteBlockTemplate,
  dividerSectionTemplate,
  spacerSectionTemplate,
];
