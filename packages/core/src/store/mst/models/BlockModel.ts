// packages/core/src/store/mst/models/BlockModel.ts
import { types, Instance, SnapshotIn, SnapshotOut, IAnyType } from 'mobx-state-tree';
import type { CSSProperties } from '../types';

/**
 * Block types supported by the email editor
 */
export enum BlockType {
  TEXT = 'text',
  IMAGE = 'image',
  BUTTON = 'button',
  DIVIDER = 'divider',
  SPACER = 'spacer',
  SOCIAL = 'social',
  HERO = 'hero',
  ACCORDION = 'accordion',
  RAW = 'raw',
  NAVBAR = 'navbar',
  CAROUSEL = 'carousel',
  TABLE = 'table',
  HEADER = 'header',
  FOOTER = 'footer',
}

/**
 * Social link for social block
 */
export const SocialLinkModel = types.model('SocialLink', {
  platform: types.string,
  url: types.string,
  color: types.maybe(types.string),
});

/**
 * Navbar link for navbar block
 */
export const NavbarLinkModel = types.model('NavbarLink', {
  href: types.string,
  label: types.string,
  color: types.maybe(types.string),
});

/**
 * Carousel image for carousel block
 */
export const CarouselImageModel = types.model('CarouselImage', {
  src: types.string,
  alt: types.maybe(types.string),
  href: types.maybe(types.string),
  thumbnailSrc: types.maybe(types.string),
});

/**
 * Accordion item for accordion block
 */
export const AccordionItemModel = types.model('AccordionItem', {
  title: types.string,
  content: types.string,
});

/**
 * Spacing model for padding/margin
 */
export const SpacingModel = types.model('Spacing', {
  top: types.maybe(types.string),
  right: types.maybe(types.string),
  bottom: types.maybe(types.string),
  left: types.maybe(types.string),
});

/**
 * BlockModel - Core block model for email elements
 *
 * All block types share a common base with type-specific properties.
 * Properties are defined directly (not frozen) for fine-grained MST reactivity.
 */
export const BlockModel = types
  .model('Block', {
    id: types.identifier,
    type: types.enumeration('BlockType', Object.values(BlockType)),
    hidden: types.optional(types.boolean, false),

    // === Common Text Properties ===
    content: types.optional(types.string, ''),
    color: types.maybe(types.string),
    backgroundColor: types.maybe(types.string),
    fontSize: types.maybe(types.string),
    fontFamily: types.maybe(types.string),
    align: types.maybe(types.enumeration(['left', 'center', 'right', 'justify'])),
    lineHeight: types.maybe(types.string),

    // === Spacing ===
    paddingTop: types.maybe(types.string),
    paddingRight: types.maybe(types.string),
    paddingBottom: types.maybe(types.string),
    paddingLeft: types.maybe(types.string),

    // === Image Properties ===
    src: types.maybe(types.string),
    alt: types.maybe(types.string),
    width: types.maybe(types.string),
    height: types.maybe(types.string),

    // === Button Properties ===
    href: types.maybe(types.string),
    label: types.maybe(types.string),
    borderRadius: types.maybe(types.string),
    border: types.maybe(types.string),
    innerPadding: types.maybe(types.string),

    // === Divider Properties ===
    borderColor: types.maybe(types.string),
    borderWidth: types.maybe(types.string),
    borderStyle: types.maybe(types.enumeration(['solid', 'dashed', 'dotted'])),

    // === Spacer Properties ===
    // (uses height from image properties)

    // === Social Properties ===
    links: types.optional(types.array(SocialLinkModel), []),
    iconSize: types.maybe(types.string),
    iconPadding: types.maybe(types.string),
    mode: types.maybe(types.enumeration(['horizontal', 'vertical', 'fixed-height', 'fluid-height'])),

    // === Hero Properties ===
    backgroundImage: types.maybe(types.string),
    backgroundHeight: types.maybe(types.string),
    backgroundWidth: types.maybe(types.string),
    verticalAlign: types.maybe(types.enumeration(['top', 'middle', 'bottom'])),

    // === Accordion Properties ===
    items: types.optional(types.array(AccordionItemModel), []),
    iconPosition: types.maybe(types.enumeration(['left', 'right'])),

    // === Raw Properties ===
    html: types.maybe(types.string),

    // === Navbar Properties ===
    navLinks: types.optional(types.array(NavbarLinkModel), []),
    hamburger: types.optional(types.boolean, false),
    baseUrl: types.maybe(types.string),
    icoColor: types.maybe(types.string),

    // === Carousel Properties ===
    images: types.optional(types.array(CarouselImageModel), []),
    thumbnails: types.maybe(types.enumeration(['visible', 'hidden'])),
    iconWidth: types.maybe(types.string),
    tbBorderRadius: types.maybe(types.string),

    // === Table Properties ===
    headers: types.optional(types.array(types.string), []),
    rows: types.optional(types.array(types.array(types.string)), []),
    cellpadding: types.maybe(types.string),
    cellspacing: types.maybe(types.string),

    // === Locked Blocks (Header/Footer) ===
    locked: types.optional(types.boolean, false),
  })
  .actions(self => ({
    /**
     * Update any style property by name
     */
    updateStyle(property: string, value: any) {
      if (property in self) {
        (self as any)[property] = value;
      }
    },

    /**
     * Update multiple properties at once
     */
    updateProperties(updates: Record<string, any>) {
      Object.entries(updates).forEach(([key, value]) => {
        if (key in self) {
          (self as any)[key] = value;
        }
      });
    },

    /**
     * Set block content (for text blocks)
     */
    setContent(content: string) {
      self.content = content;
    },

    /**
     * Toggle block visibility
     */
    toggleHidden() {
      self.hidden = !self.hidden;
    },

    /**
     * Set padding values
     */
    setPadding(padding: { top?: string; right?: string; bottom?: string; left?: string }) {
      if (padding.top !== undefined) self.paddingTop = padding.top;
      if (padding.right !== undefined) self.paddingRight = padding.right;
      if (padding.bottom !== undefined) self.paddingBottom = padding.bottom;
      if (padding.left !== undefined) self.paddingLeft = padding.left;
    },

    /**
     * Add a social link
     */
    addSocialLink(platform: string, url: string, color?: string) {
      self.links.push(SocialLinkModel.create({ platform, url, color }));
    },

    /**
     * Remove a social link by index
     */
    removeSocialLink(index: number) {
      self.links.splice(index, 1);
    },

    /**
     * Add a navbar link
     */
    addNavbarLink(href: string, label: string, color?: string) {
      self.navLinks.push(NavbarLinkModel.create({ href, label, color }));
    },

    /**
     * Remove a navbar link by index
     */
    removeNavbarLink(index: number) {
      self.navLinks.splice(index, 1);
    },

    /**
     * Add a carousel image
     */
    addCarouselImage(src: string, alt?: string, href?: string, thumbnailSrc?: string) {
      self.images.push(CarouselImageModel.create({ src, alt, href, thumbnailSrc }));
    },

    /**
     * Remove a carousel image by index
     */
    removeCarouselImage(index: number) {
      self.images.splice(index, 1);
    },

    /**
     * Add an accordion item
     */
    addAccordionItem(title: string, content: string) {
      self.items.push(AccordionItemModel.create({ title, content }));
    },

    /**
     * Remove an accordion item by index
     */
    removeAccordionItem(index: number) {
      self.items.splice(index, 1);
    },

    /**
     * Add a table row
     */
    addTableRow(cells: string[]) {
      self.rows.push(cells);
    },

    /**
     * Remove a table row by index
     */
    removeTableRow(index: number) {
      self.rows.splice(index, 1);
    },
  }))
  .views(self => ({
    /**
     * Computed style object for React rendering
     */
    get computedStyle(): CSSProperties {
      const style: CSSProperties = {};

      if (self.color) style.color = self.color;
      if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
      if (self.fontSize) style.fontSize = self.fontSize;
      if (self.fontFamily) style.fontFamily = self.fontFamily;
      if (self.align) style.textAlign = self.align as CSSProperties['textAlign'];
      if (self.lineHeight) style.lineHeight = self.lineHeight;
      if (self.paddingTop) style.paddingTop = self.paddingTop;
      if (self.paddingRight) style.paddingRight = self.paddingRight;
      if (self.paddingBottom) style.paddingBottom = self.paddingBottom;
      if (self.paddingLeft) style.paddingLeft = self.paddingLeft;
      if (self.borderRadius) style.borderRadius = self.borderRadius;
      if (self.border) style.border = self.border;

      return style;
    },

    /**
     * Get padding as a single object
     */
    get padding(): { top?: string; right?: string; bottom?: string; left?: string } {
      return {
        top: self.paddingTop || undefined,
        right: self.paddingRight || undefined,
        bottom: self.paddingBottom || undefined,
        left: self.paddingLeft || undefined,
      };
    },

    /**
     * Get padding as a CSS string (e.g., "10px 20px 10px 20px")
     */
    get paddingString(): string | undefined {
      const { paddingTop, paddingRight, paddingBottom, paddingLeft } = self;
      if (!paddingTop && !paddingRight && !paddingBottom && !paddingLeft) {
        return undefined;
      }
      return `${paddingTop || '0'} ${paddingRight || '0'} ${paddingBottom || '0'} ${paddingLeft || '0'}`;
    },

    /**
     * MJML attributes for export
     */
    get mjmlAttributes(): Record<string, string> {
      const attrs: Record<string, string> = {};

      // Common attributes
      if (self.color) attrs.color = self.color;
      if (self.backgroundColor) attrs['background-color'] = self.backgroundColor;
      if (self.fontSize) attrs['font-size'] = self.fontSize;
      if (self.fontFamily) attrs['font-family'] = self.fontFamily;
      if (self.align) attrs.align = self.align;
      if (self.lineHeight) attrs['line-height'] = self.lineHeight;

      // Padding
      const paddingParts = [];
      if (self.paddingTop) paddingParts.push(`top:${self.paddingTop}`);
      if (self.paddingRight) paddingParts.push(`right:${self.paddingRight}`);
      if (self.paddingBottom) paddingParts.push(`bottom:${self.paddingBottom}`);
      if (self.paddingLeft) paddingParts.push(`left:${self.paddingLeft}`);
      if (paddingParts.length > 0) {
        const padding = `${self.paddingTop || '0'} ${self.paddingRight || '0'} ${self.paddingBottom || '0'} ${self.paddingLeft || '0'}`;
        attrs.padding = padding;
      }

      // Image attributes
      if (self.src) attrs.src = self.src;
      if (self.alt) attrs.alt = self.alt;
      if (self.width) attrs.width = self.width;
      if (self.height) attrs.height = self.height;

      // Button attributes
      if (self.href) attrs.href = self.href;
      if (self.borderRadius) attrs['border-radius'] = self.borderRadius;
      if (self.border) attrs.border = self.border;
      if (self.innerPadding) attrs['inner-padding'] = self.innerPadding;

      // Divider attributes
      if (self.borderColor) attrs['border-color'] = self.borderColor;
      if (self.borderWidth) attrs['border-width'] = self.borderWidth;
      if (self.borderStyle) attrs['border-style'] = self.borderStyle;

      return attrs;
    },

    /**
     * Check if this is a text-based block
     */
    get isTextBlock(): boolean {
      return self.type === BlockType.TEXT;
    },

    /**
     * Check if this is an image block
     */
    get isImageBlock(): boolean {
      return self.type === BlockType.IMAGE;
    },

    /**
     * Check if this is a button block
     */
    get isButtonBlock(): boolean {
      return self.type === BlockType.BUTTON;
    },

    /**
     * Check if this block is locked (header/footer)
     */
    get isLocked(): boolean {
      return self.locked || self.type === BlockType.HEADER || self.type === BlockType.FOOTER;
    },

    /**
     * Get display name for layers panel
     */
    get displayName(): string {
      switch (self.type) {
        case BlockType.TEXT:
          // Return first 20 chars of content stripped of HTML
          const text = self.content.replace(/<[^>]*>/g, '').trim();
          return text.length > 20 ? text.substring(0, 20) + '...' : text || 'Text';
        case BlockType.IMAGE:
          return self.alt || 'Image';
        case BlockType.BUTTON:
          return self.label || 'Button';
        case BlockType.DIVIDER:
          return 'Divider';
        case BlockType.SPACER:
          return `Spacer (${self.height || '20px'})`;
        case BlockType.SOCIAL:
          return 'Social Links';
        case BlockType.HERO:
          return 'Hero';
        case BlockType.ACCORDION:
          return 'Accordion';
        case BlockType.RAW:
          return 'Custom HTML';
        case BlockType.NAVBAR:
          return 'Navigation';
        case BlockType.CAROUSEL:
          return 'Carousel';
        case BlockType.TABLE:
          return 'Table';
        case BlockType.HEADER:
          return 'Header';
        case BlockType.FOOTER:
          return 'Footer';
        default:
          return 'Block';
      }
    },
  }));

export type BlockInstance = Instance<typeof BlockModel>;
export type BlockSnapshotIn = SnapshotIn<typeof BlockModel>;
export type BlockSnapshotOut = SnapshotOut<typeof BlockModel>;
