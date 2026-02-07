// packages/blocks/src/prebuilt/feature-templates.ts
// Pre-built feature grid templates with ReTurn Hypnosis branding

import type { PrebuiltTemplate } from '@returnhypnosis/email-editor-core';
import { BRAND, TYPOGRAPHY, CONTENT } from './return-brand';

/**
 * Features 2-Column - Two feature boxes side by side
 * Like "A breath of fresh air / Unplug and unwind" example
 */
export const features2ColTemplate: PrebuiltTemplate = {
  id: 'features-2col',
  name: 'Features - 2 Columns',
  category: 'content',
  description: 'Two feature boxes with icons side by side',
  section: {
    id: 'features-2col-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '50px', bottom: '50px' },
    noStack: true,
    columns: [
      {
        id: 'features-2col-col-1',
        width: 50,
        padding: { left: '20px', right: '20px' },
        backgroundColor: BRAND.bgLight,
        blocks: [
          {
            id: 'features-2col-1-icon',
            type: 'image',
            src: 'https://placehold.co/60x60/944923/F7F3EE?text=✧',
            alt: 'Clarity icon',
            width: '60px',
            align: 'center',
          },
          {
            id: 'features-2col-1-title',
            type: 'text',
            content: `<h3 style="margin:16px 0 8px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Find Clarity</h3>`,
            align: 'center',
          },
          {
            id: 'features-2col-1-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">Uncover the root causes of patterns that no longer serve you. Gain understanding of your deeper self.</p>`,
            align: 'center',
          },
        ],
      },
      {
        id: 'features-2col-col-2',
        width: 50,
        padding: { left: '20px', right: '20px' },
        backgroundColor: BRAND.bgLight,
        blocks: [
          {
            id: 'features-2col-2-icon',
            type: 'image',
            src: 'https://placehold.co/60x60/944923/F7F3EE?text=☯',
            alt: 'Resolution icon',
            width: '60px',
            align: 'center',
          },
          {
            id: 'features-2col-2-title',
            type: 'text',
            content: `<h3 style="margin:16px 0 8px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Release & Heal</h3>`,
            align: 'center',
          },
          {
            id: 'features-2col-2-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">Let go of old wounds and limiting beliefs. Create space for new possibilities in your life.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Features 3-Column - Three feature boxes
 * Like "Wild beauty / Fresh adventure / Natural wonder" example
 */
export const features3ColTemplate: PrebuiltTemplate = {
  id: 'features-3col',
  name: 'Features - 3 Columns',
  category: 'content',
  description: 'Three feature boxes with icons',
  section: {
    id: 'features-3col-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '50px', bottom: '50px' },
    noStack: true,
    columns: [
      {
        id: 'features-3col-col-1',
        width: 33,
        padding: { left: '16px', right: '16px' },
        blocks: [
          {
            id: 'features-3col-1-icon',
            type: 'image',
            src: 'https://placehold.co/50x50/944923/F7F3EE?text=◇',
            alt: 'Icon',
            width: '50px',
            align: 'center',
          },
          {
            id: 'features-3col-1-title',
            type: 'text',
            content: `<h3 style="margin:14px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Past Life Regression</h3>`,
            align: 'center',
          },
          {
            id: 'features-3col-1-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Explore previous lifetimes to understand current patterns and relationships.</p>`,
            align: 'center',
          },
        ],
      },
      {
        id: 'features-3col-col-2',
        width: 33,
        padding: { left: '16px', right: '16px' },
        blocks: [
          {
            id: 'features-3col-2-icon',
            type: 'image',
            src: 'https://placehold.co/50x50/944923/F7F3EE?text=○',
            alt: 'Icon',
            width: '50px',
            align: 'center',
          },
          {
            id: 'features-3col-2-title',
            type: 'text',
            content: `<h3 style="margin:14px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Inner Child Work</h3>`,
            align: 'center',
          },
          {
            id: 'features-3col-2-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Heal early experiences and reconnect with your authentic self.</p>`,
            align: 'center',
          },
        ],
      },
      {
        id: 'features-3col-col-3',
        width: 33,
        padding: { left: '16px', right: '16px' },
        blocks: [
          {
            id: 'features-3col-3-icon',
            type: 'image',
            src: 'https://placehold.co/50x50/944923/F7F3EE?text=△',
            alt: 'Icon',
            width: '50px',
            align: 'center',
          },
          {
            id: 'features-3col-3-title',
            type: 'text',
            content: `<h3 style="margin:14px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Life Between Lives</h3>`,
            align: 'center',
          },
          {
            id: 'features-3col-3-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Journey to the spiritual realm between incarnations.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Features 4-Column (2x2 Grid) - Four features in a grid
 * Like "Open horizon / Rugged terrain / Coastal charm / Outdoor escape" example
 */
export const features4ColTemplate: PrebuiltTemplate = {
  id: 'features-4col',
  name: 'Features - 4 Grid',
  category: 'content',
  description: 'Four feature boxes in 2x2 grid',
  section: {
    id: 'features-4col-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'features-4col-col-1',
        width: 50,
        padding: { left: '20px', right: '20px', bottom: '30px' },
        blocks: [
          {
            id: 'features-4col-1-icon',
            type: 'image',
            src: 'https://placehold.co/45x45/D4A574/F7F3EE?text=●',
            alt: 'Icon',
            width: '45px',
            align: 'center',
          },
          {
            id: 'features-4col-1-title',
            type: 'text',
            content: `<h3 style="margin:12px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Anxiety & Stress</h3>`,
            align: 'center',
          },
          {
            id: 'features-4col-1-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Find the source of anxious feelings and release them for good.</p>`,
            align: 'center',
          },
        ],
      },
      {
        id: 'features-4col-col-2',
        width: 50,
        padding: { left: '20px', right: '20px', bottom: '30px' },
        blocks: [
          {
            id: 'features-4col-2-icon',
            type: 'image',
            src: 'https://placehold.co/45x45/D4A574/F7F3EE?text=◆',
            alt: 'Icon',
            width: '45px',
            align: 'center',
          },
          {
            id: 'features-4col-2-title',
            type: 'text',
            content: `<h3 style="margin:12px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Relationships</h3>`,
            align: 'center',
          },
          {
            id: 'features-4col-2-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Understand karmic connections and heal relationship patterns.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Features 4-Column Row 2 (continuation of grid)
 */
export const features4ColRow2Template: PrebuiltTemplate = {
  id: 'features-4col-row2',
  name: 'Features - 4 Grid (Row 2)',
  category: 'content',
  description: 'Second row of 4-column grid',
  section: {
    id: 'features-4col-row2-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '0px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'features-4col-row2-col-1',
        width: 50,
        padding: { left: '20px', right: '20px' },
        blocks: [
          {
            id: 'features-4col-row2-1-icon',
            type: 'image',
            src: 'https://placehold.co/45x45/D4A574/F7F3EE?text=◇',
            alt: 'Icon',
            width: '45px',
            align: 'center',
          },
          {
            id: 'features-4col-row2-1-title',
            type: 'text',
            content: `<h3 style="margin:12px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Life Purpose</h3>`,
            align: 'center',
          },
          {
            id: 'features-4col-row2-1-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Discover your soul's purpose and align with your true path.</p>`,
            align: 'center',
          },
        ],
      },
      {
        id: 'features-4col-row2-col-2',
        width: 50,
        padding: { left: '20px', right: '20px' },
        blocks: [
          {
            id: 'features-4col-row2-2-icon',
            type: 'image',
            src: 'https://placehold.co/45x45/D4A574/F7F3EE?text=○',
            alt: 'Icon',
            width: '45px',
            align: 'center',
          },
          {
            id: 'features-4col-row2-2-title',
            type: 'text',
            content: `<h3 style="margin:12px 0 6px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Self-Confidence</h3>`,
            align: 'center',
          },
          {
            id: 'features-4col-row2-2-body',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.caption}color:${BRAND.textBody};">Build unshakeable confidence from the inside out.</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Take Action / CTA Section
 * Like "Organized Adventures: What are they?" example
 */
export const takeActionTemplate: PrebuiltTemplate = {
  id: 'take-action',
  name: 'Take Action / CTA',
  category: 'content',
  description: 'Call-to-action section with guidance label',
  section: {
    id: 'take-action-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px', left: '30px', right: '30px' },
    columns: [
      {
        id: 'take-action-col',
        blocks: [
          {
            id: 'take-action-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">GUIDANCE</p>`,
            align: 'left',
          },
          {
            id: 'take-action-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">How Does Regression Hypnotherapy Work?</h2>`,
            align: 'left',
          },
          {
            id: 'take-action-body',
            type: 'text',
            content: `<p style="margin:16px 0 24px 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">In a deeply relaxed state, you'll be guided to access memories and experiences stored in your subconscious mind. This isn't about "being hypnotized" – you remain fully aware and in control throughout the session.</p>`,
            align: 'left',
          },
          {
            id: 'take-action-button',
            type: 'button',
            label: CONTENT.ctaExplore,
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.primaryDark,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '24px', right: '24px', top: '12px', bottom: '12px' },
          },
        ],
      },
    ],
  },
};

export const featureTemplates = [
  features2ColTemplate,
  features3ColTemplate,
  features4ColTemplate,
  features4ColRow2Template,
  takeActionTemplate,
];
