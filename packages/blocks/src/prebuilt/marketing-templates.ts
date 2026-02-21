// packages/blocks/src/prebuilt/marketing-templates.ts
// Pre-built marketing templates (events, coupons, products) with ReTurn Hypnosis branding

import type { PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { BRAND, TYPOGRAPHY, CONTENT } from './return-brand';

// ============================================
// EVENT TEMPLATES
// ============================================

/**
 * Event Simple - Basic event details
 */
export const eventSimpleTemplate: PrebuiltTemplate = {
  id: 'event-simple',
  name: 'Event - Simple',
  category: 'content',
  description: 'Event with date and time details',
  section: {
    id: 'event-simple-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px', left: '30px', right: '30px' },
    columns: [
      {
        id: 'event-simple-col',
        blocks: [
          {
            id: 'event-simple-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">ONLINE WORKSHOP</p>`,
            align: 'left',
          },
          {
            id: 'event-simple-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">Introduction to Self-Hypnosis</h2>`,
            align: 'left',
          },
          {
            id: 'event-simple-desc',
            type: 'text',
            content: `<p style="margin:16px 0;${TYPOGRAPHY.body}color:${BRAND.textBody};">Learn powerful techniques to access your subconscious mind and create lasting positive change in your daily life.</p>`,
            align: 'left',
          },
          {
            id: 'event-simple-date',
            type: 'text',
            content: `<p style="margin:0 0 4px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textDark};"><strong>Date:</strong> Saturday, March 15th, 2025</p>`,
            align: 'left',
          },
          {
            id: 'event-simple-time',
            type: 'text',
            content: `<p style="margin:0 0 20px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textDark};"><strong>Time:</strong> 10:00 AM - 12:00 PM (EST)</p>`,
            align: 'left',
          },
          {
            id: 'event-simple-button',
            type: 'button',
            label: 'Register Now',
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '24px', right: '24px', top: '12px', bottom: '12px' },
          },
        ],
      },
    ],
  },
};

/**
 * Event with Image - Event card with visual
 * Like "Travel Talks Lecture" example
 */
export const eventImageTemplate: PrebuiltTemplate = {
  id: 'event-image',
  name: 'Event - With Image',
  category: 'content',
  description: 'Event card with image',
  section: {
    id: 'event-image-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'event-image-text-col',
        width: 55,
        padding: { left: '30px', right: '20px' },
        blocks: [
          {
            id: 'event-image-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">LIVE ONLINE</p>`,
            align: 'left',
          },
          {
            id: 'event-image-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">Past Life Exploration Evening</h2>`,
            align: 'left',
          },
          {
            id: 'event-image-desc',
            type: 'text',
            content: `<p style="margin:12px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">Join Sharon for a guided group journey exploring the concept of past lives. Perfect for curious beginners.</p>`,
            align: 'left',
          },
          {
            id: 'event-image-datetime',
            type: 'text',
            content: `<p style="margin:0 0 16px 0;${TYPOGRAPHY.caption}color:${BRAND.textLight};">April 20th, 2025 • 7:00 PM EST</p>`,
            align: 'left',
          },
          {
            id: 'event-image-button',
            type: 'button',
            label: 'Add to Calendar',
            href: '#',
            align: 'left',
            backgroundColor: BRAND.primaryDark,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '20px', right: '20px', top: '10px', bottom: '10px' },
          },
        ],
      },
      {
        id: 'event-image-image-col',
        width: 45,
        padding: { right: '30px' },
        blocks: [
          {
            id: 'event-image-image',
            type: 'image',
            src: 'https://placehold.co/280x220/944923/F7F3EE?text=Event+Image',
            alt: 'Event image',
            width: '100%',
            align: 'center',
            borderRadius: '8px',
          },
        ],
      },
    ],
  },
};

// ============================================
// COUPON / OFFER TEMPLATES
// ============================================

/**
 * Coupon Discount - Discount offer with code
 * Like "-50% THANKYOU50" example
 */
export const couponDiscountTemplate: PrebuiltTemplate = {
  id: 'coupon-discount',
  name: 'Coupon - Discount',
  category: 'content',
  description: 'Discount offer with code box',
  section: {
    id: 'coupon-discount-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'coupon-discount-text-col',
        width: 60,
        padding: { left: '30px', right: '20px' },
        verticalAlign: 'middle',
        blocks: [
          {
            id: 'coupon-discount-label',
            type: 'text',
            content: `<p style="margin:0 0 6px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">SPECIAL OFFER</p>`,
            align: 'left',
          },
          {
            id: 'coupon-discount-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">New Client Welcome Gift</h2>`,
            align: 'left',
          },
          {
            id: 'coupon-discount-desc',
            type: 'text',
            content: `<p style="margin:12px 0 0 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">Book your first session and receive a complimentary guided meditation recording.</p>`,
            align: 'left',
          },
        ],
      },
      {
        id: 'coupon-discount-code-col',
        width: 40,
        padding: { right: '30px' },
        verticalAlign: 'middle',
        blocks: [
          {
            id: 'coupon-discount-amount',
            type: 'text',
            content: `<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:48px;font-weight:600;color:${BRAND.primary};">FREE</p>`,
            align: 'center',
          },
          {
            id: 'coupon-discount-codelabel',
            type: 'text',
            content: `<p style="margin:8px 0 4px 0;${TYPOGRAPHY.caption}color:${BRAND.textLight};">USE CODE:</p>`,
            align: 'center',
          },
          {
            id: 'coupon-discount-code',
            type: 'text',
            content: `<p style="margin:0;padding:8px 16px;background:${BRAND.bgCream};border:2px dashed ${BRAND.primary};border-radius:4px;${TYPOGRAPHY.label}color:${BRAND.primary};display:inline-block;">WELCOME2025</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Coupon Gift Card - Gift card style
 * Like the "Gift card HBD2U" example
 */
export const couponGiftCardTemplate: PrebuiltTemplate = {
  id: 'coupon-giftcard',
  name: 'Coupon - Gift Card',
  category: 'content',
  description: 'Gift card style layout',
  section: {
    id: 'coupon-giftcard-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '50px', bottom: '50px', left: '40px', right: '40px' },
    columns: [
      {
        id: 'coupon-giftcard-col',
        blocks: [
          {
            id: 'coupon-giftcard-title',
            type: 'text',
            content: `<h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:42px;font-weight:600;color:${BRAND.primary};">Gift Certificate</h1>`,
            align: 'center',
          },
          {
            id: 'coupon-giftcard-divider',
            type: 'divider',
            borderColor: BRAND.textDark,
            borderWidth: '1px',
            borderStyle: 'solid',
            padding: { top: '20px', bottom: '20px' },
            width: '120px',
          },
          {
            id: 'coupon-giftcard-codelabel',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.textLight};">CERTIFICATE CODE:</p>`,
            align: 'center',
          },
          {
            id: 'coupon-giftcard-code',
            type: 'text',
            content: `<p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:600;color:${BRAND.primary};letter-spacing:4px;">GIFT-2025</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

/**
 * Coupon Banner - Simple banner with code
 * Like the "FIRESIDE40" red banner example
 */
export const couponBannerTemplate: PrebuiltTemplate = {
  id: 'coupon-banner',
  name: 'Coupon - Banner',
  category: 'content',
  description: 'Simple banner with promotional code',
  section: {
    id: 'coupon-banner-section',
    type: 'section',
    backgroundColor: BRAND.primary,
    padding: { top: '20px', bottom: '20px' },
    columns: [
      {
        id: 'coupon-banner-col',
        blocks: [
          {
            id: 'coupon-banner-code',
            type: 'text',
            content: `<p style="margin:0;${TYPOGRAPHY.label}color:${BRAND.textWhite};letter-spacing:6px;font-size:18px;">TRANSFORM20</p>`,
            align: 'center',
          },
        ],
      },
    ],
  },
};

// ============================================
// PRODUCT / SERVICE TEMPLATES
// ============================================

/**
 * Product Right - Service with image on right
 * Like "Nitro Weekender Backpack" example
 */
export const productRightTemplate: PrebuiltTemplate = {
  id: 'product-right',
  name: 'Service - Image Right',
  category: 'products',
  description: 'Service offering with image on right',
  section: {
    id: 'product-right-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'product-right-text-col',
        width: 55,
        padding: { left: '30px', right: '20px' },
        verticalAlign: 'middle',
        blocks: [
          {
            id: 'product-right-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">SIGNATURE SESSION</p>`,
            align: 'left',
          },
          {
            id: 'product-right-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">Past Life Regression</h2>`,
            align: 'left',
          },
          {
            id: 'product-right-desc',
            type: 'text',
            content: `<p style="margin:12px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">A transformative 2-3 hour session exploring your past lives to gain insight into current challenges and relationships.</p>`,
            align: 'left',
          },
          {
            id: 'product-right-price',
            type: 'text',
            content: `<p style="margin:0 0 16px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;color:${BRAND.primary};">$350</p>`,
            align: 'left',
          },
          {
            id: 'product-right-button',
            type: 'button',
            label: 'Book Now',
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.primaryDark,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '24px', right: '24px', top: '10px', bottom: '10px' },
          },
        ],
      },
      {
        id: 'product-right-image-col',
        width: 45,
        padding: { right: '30px' },
        blocks: [
          {
            id: 'product-right-image',
            type: 'image',
            src: 'https://placehold.co/300x300/E8E2DB/944923?text=Session',
            alt: 'Session image',
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
 * Product Left - Service with image on left
 */
export const productLeftTemplate: PrebuiltTemplate = {
  id: 'product-left',
  name: 'Service - Image Left',
  category: 'products',
  description: 'Service offering with image on left',
  section: {
    id: 'product-left-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'product-left-image-col',
        width: 45,
        padding: { left: '30px' },
        blocks: [
          {
            id: 'product-left-image',
            type: 'image',
            src: 'https://placehold.co/300x300/944923/F7F3EE?text=Package',
            alt: 'Package image',
            width: '100%',
            align: 'center',
            borderRadius: '8px',
          },
        ],
      },
      {
        id: 'product-left-text-col',
        width: 55,
        padding: { left: '20px', right: '30px' },
        verticalAlign: 'middle',
        blocks: [
          {
            id: 'product-left-label',
            type: 'text',
            content: `<p style="margin:0 0 8px 0;${TYPOGRAPHY.label}color:${BRAND.primary};">PACKAGE</p>`,
            align: 'left',
          },
          {
            id: 'product-left-title',
            type: 'text',
            content: `<h2 style="margin:0;${TYPOGRAPHY.h3}color:${BRAND.textDark};">Transformation Journey</h2>`,
            align: 'left',
          },
          {
            id: 'product-left-desc',
            type: 'text',
            content: `<p style="margin:12px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textBody};">Three sessions designed to address deep-seated patterns. Includes follow-up support between sessions.</p>`,
            align: 'left',
          },
          {
            id: 'product-left-price',
            type: 'text',
            content: `<p style="margin:0;"><span style="${TYPOGRAPHY.caption}color:${BRAND.textLight};text-decoration:line-through;">$1050</span> <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;color:${BRAND.primary};">$900</span></p>`,
            align: 'left',
          },
          {
            id: 'product-left-save',
            type: 'text',
            content: `<p style="margin:4px 0 16px 0;${TYPOGRAPHY.caption}color:${BRAND.primary};">You Save $150</p>`,
            align: 'left',
          },
          {
            id: 'product-left-button',
            type: 'button',
            label: 'Learn More',
            href: CONTENT.website,
            align: 'left',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '24px', right: '24px', top: '10px', bottom: '10px' },
          },
        ],
      },
    ],
  },
};

/**
 * Products 2-Column - Two services side by side
 */
export const products2ColTemplate: PrebuiltTemplate = {
  id: 'products-2col',
  name: 'Services - 2 Columns',
  category: 'products',
  description: 'Two service offerings side by side',
  section: {
    id: 'products-2col-section',
    type: 'section',
    backgroundColor: BRAND.bgWhite,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'products-2col-col-1',
        width: 50,
        padding: { left: '20px', right: '15px' },
        blocks: [
          {
            id: 'products-2col-1-image',
            type: 'image',
            src: 'https://placehold.co/260x200/E8E2DB/944923?text=Session+1',
            alt: 'Session 1',
            width: '100%',
            align: 'center',
            borderRadius: '6px',
          },
          {
            id: 'products-2col-1-title',
            type: 'text',
            content: `<h3 style="margin:16px 0 8px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Past Life Regression</h3>`,
            align: 'left',
          },
          {
            id: 'products-2col-1-price',
            type: 'text',
            content: `<p style="margin:0 0 12px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:${BRAND.primary};">$350</p>`,
            align: 'left',
          },
          {
            id: 'products-2col-1-button',
            type: 'button',
            label: 'Book Now',
            href: '#',
            align: 'left',
            backgroundColor: BRAND.primaryDark,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '20px', right: '20px', top: '8px', bottom: '8px' },
          },
        ],
      },
      {
        id: 'products-2col-col-2',
        width: 50,
        padding: { left: '15px', right: '20px' },
        blocks: [
          {
            id: 'products-2col-2-image',
            type: 'image',
            src: 'https://placehold.co/260x200/E8E2DB/944923?text=Session+2',
            alt: 'Session 2',
            width: '100%',
            align: 'center',
            borderRadius: '6px',
          },
          {
            id: 'products-2col-2-title',
            type: 'text',
            content: `<h3 style="margin:16px 0 8px 0;${TYPOGRAPHY.h4}color:${BRAND.textDark};">Life Between Lives</h3>`,
            align: 'left',
          },
          {
            id: 'products-2col-2-price',
            type: 'text',
            content: `<p style="margin:0 0 12px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:20px;font-weight:600;color:${BRAND.primary};">$450</p>`,
            align: 'left',
          },
          {
            id: 'products-2col-2-button',
            type: 'button',
            label: 'Book Now',
            href: '#',
            align: 'left',
            backgroundColor: BRAND.primaryDark,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '20px', right: '20px', top: '8px', bottom: '8px' },
          },
        ],
      },
    ],
  },
};

/**
 * Products 3-Column - Three services in a row
 */
export const products3ColTemplate: PrebuiltTemplate = {
  id: 'products-3col',
  name: 'Services - 3 Columns',
  category: 'products',
  description: 'Three service offerings in a row',
  section: {
    id: 'products-3col-section',
    type: 'section',
    backgroundColor: BRAND.bgCream,
    padding: { top: '40px', bottom: '40px' },
    noStack: true,
    columns: [
      {
        id: 'products-3col-col-1',
        width: 33,
        padding: { left: '15px', right: '10px' },
        blocks: [
          {
            id: 'products-3col-1-image',
            type: 'image',
            src: 'https://placehold.co/180x140/944923/F7F3EE?text=Basic',
            alt: 'Basic session',
            width: '100%',
            align: 'center',
            borderRadius: '4px',
          },
          {
            id: 'products-3col-1-title',
            type: 'text',
            content: `<h4 style="margin:12px 0 4px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textDark};font-weight:600;">Discovery Call</h4>`,
            align: 'center',
          },
          {
            id: 'products-3col-1-price',
            type: 'text',
            content: `<p style="margin:0 0 10px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:${BRAND.primary};">Free</p>`,
            align: 'center',
          },
          {
            id: 'products-3col-1-button',
            type: 'button',
            label: 'Schedule',
            href: '#',
            align: 'center',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '16px', right: '16px', top: '6px', bottom: '6px' },
          },
        ],
      },
      {
        id: 'products-3col-col-2',
        width: 33,
        padding: { left: '10px', right: '10px' },
        blocks: [
          {
            id: 'products-3col-2-image',
            type: 'image',
            src: 'https://placehold.co/180x140/944923/F7F3EE?text=Standard',
            alt: 'Standard session',
            width: '100%',
            align: 'center',
            borderRadius: '4px',
          },
          {
            id: 'products-3col-2-title',
            type: 'text',
            content: `<h4 style="margin:12px 0 4px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textDark};font-weight:600;">Single Session</h4>`,
            align: 'center',
          },
          {
            id: 'products-3col-2-price',
            type: 'text',
            content: `<p style="margin:0 0 10px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:${BRAND.primary};">$350</p>`,
            align: 'center',
          },
          {
            id: 'products-3col-2-button',
            type: 'button',
            label: 'Book',
            href: '#',
            align: 'center',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '16px', right: '16px', top: '6px', bottom: '6px' },
          },
        ],
      },
      {
        id: 'products-3col-col-3',
        width: 33,
        padding: { left: '10px', right: '15px' },
        blocks: [
          {
            id: 'products-3col-3-image',
            type: 'image',
            src: 'https://placehold.co/180x140/944923/F7F3EE?text=Premium',
            alt: 'Premium package',
            width: '100%',
            align: 'center',
            borderRadius: '4px',
          },
          {
            id: 'products-3col-3-title',
            type: 'text',
            content: `<h4 style="margin:12px 0 4px 0;${TYPOGRAPHY.bodySmall}color:${BRAND.textDark};font-weight:600;">3-Session Package</h4>`,
            align: 'center',
          },
          {
            id: 'products-3col-3-price',
            type: 'text',
            content: `<p style="margin:0 0 10px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:${BRAND.primary};">$900</p>`,
            align: 'center',
          },
          {
            id: 'products-3col-3-button',
            type: 'button',
            label: 'Book',
            href: '#',
            align: 'center',
            backgroundColor: BRAND.primary,
            color: BRAND.textWhite,
            borderRadius: '4px',
            padding: { left: '16px', right: '16px', top: '6px', bottom: '6px' },
          },
        ],
      },
    ],
  },
};

export const marketingTemplates = [
  eventSimpleTemplate,
  eventImageTemplate,
  couponDiscountTemplate,
  couponGiftCardTemplate,
  couponBannerTemplate,
  productRightTemplate,
  productLeftTemplate,
  products2ColTemplate,
  products3ColTemplate,
];

