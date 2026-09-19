// packages/core/src/schema/types.ts
// Core type definitions for email templates

import type { BackgroundGradient } from './gradient';

export type { BackgroundGradient, GradientStop } from './gradient';

/**
 * Spacing configuration for padding/margin
 */
export interface Spacing {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

/**
 * Custom font definition
 */
export interface FontDefinition {
  name: string;
  href: string;
}

/**
 * Theme color for reusable brand colors
 */
export interface ThemeColor {
  name: string;
  value: string;
}

/**
 * MJML attributes the editor has no control for, kept as found (values as they
 * stood in the source, XML entities included) and emitted again by the
 * compiler after the attributes the editor sets. Written by the MJML import,
 * so an imported document compiles the way its source did: a `css-class` the
 * author's `mj-style` rules target, an `mj-class`, a button's `font-weight`.
 */
export type ExtraAttributes = Record<string, string>;

/**
 * What an imported document's `<mj-head>` and `<mj-body>` carried beyond the
 * fields the editor has (title, preview, fonts, breakpoint, styles). When
 * present, the compiler emits `attributes` instead of its own default
 * `<mj-attributes>` (so the source's `mj-all`, per-component defaults and
 * `mj-class` definitions apply as they did), `bodyAttributes` on `<mj-body>`,
 * and `headRaw` (for example `mj-html-attributes`) verbatim inside `<mj-head>`.
 */
export interface MjmlHead {
  /** The inner markup of `<mj-attributes>`, verbatim. An empty string means "no defaults at all". */
  attributes?: string;
  /** Attributes of `<mj-body>`, e.g. `background-color`, `width`. */
  bodyAttributes?: ExtraAttributes;
  /** Other head elements, verbatim, in source order. */
  headRaw?: string;
}

/**
 * Email template metadata
 */
export interface TemplateMetadata {
  subject?: string;
  previewText?: string;
  title?: string;
  /** Epoch milliseconds (what the editor emits) or an ISO 8601 string */
  createdAt?: string | number;
  /** Epoch milliseconds (what the editor emits) or an ISO 8601 string */
  updatedAt?: string | number;
  fonts?: FontDefinition[];
  themeColors?: ThemeColor[];
  breakpoint?: string;
  customCSS?: string;
  inlineCSS?: string;
  /** Set by the MJML import; see {@link MjmlHead}. */
  mjmlHead?: MjmlHead;
}

/**
 * Base block interface - all blocks extend this
 */
export interface BaseBlock {
  id: string;
  type: string;
  hidden?: boolean;
  /** See {@link ExtraAttributes}. */
  extraAttributes?: ExtraAttributes;
}

/**
 * Text block with rich content
 */
export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string; // HTML string from TipTap
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  fontSize?: string;
  fontFamily?: string;
  padding?: Spacing;
  lineHeight?: string;
}

/**
 * Image block
 */
export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  width?: string;
  height?: string;
  align?: 'left' | 'center' | 'right';
  href?: string;
  padding?: Spacing;
  borderRadius?: string;
}

/**
 * Button block
 */
export interface ButtonBlock extends BaseBlock {
  type: 'button';
  label: string;
  href: string;
  align?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  color?: string;
  borderRadius?: string;
  border?: string;
  padding?: Spacing;
  innerPadding?: string;
}

/**
 * Divider block
 */
export interface DividerBlock extends BaseBlock {
  type: 'divider';
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  width?: string;
  padding?: Spacing;
}

/**
 * Spacer block for vertical spacing
 */
export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: string;
}

/**
 * Custom branded header block (locked)
 */
export interface HeaderBlock extends BaseBlock {
  type: 'header';
  locked: true;
}

/**
 * Custom branded footer block (locked)
 */
export interface FooterBlock extends BaseBlock {
  type: 'footer';
  locked: true;
}

/**
 * Social link definition
 */
export interface SocialLink {
  platform: string;
  url: string;
  color?: string; // Per-icon color override (uses platform default if not set)
}

/**
 * Social block for social media icons
 */
export interface SocialBlock extends BaseBlock {
  type: 'social';
  links: SocialLink[];
  iconSize?: string;
  iconPadding?: string;
  borderRadius?: string;
  align?: 'left' | 'center' | 'right';
  mode?: 'horizontal' | 'vertical';
}

/**
 * Hero block with background image
 */
export interface HeroBlock extends BaseBlock {
  type: 'hero';
  backgroundImage: string;
  backgroundHeight?: string;
  backgroundWidth?: string;
  backgroundColor?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  mode?: 'fixed-height' | 'fluid-height';
}

/**
 * Accordion item
 */
export interface AccordionItem {
  title: string;
  content: string;
}

/**
 * Accordion block for collapsible content
 */
export interface AccordionBlock extends BaseBlock {
  type: 'accordion';
  items: AccordionItem[];
  iconPosition?: 'left' | 'right';
  borderColor?: string;
  fontFamily?: string;
}

/**
 * Raw HTML block
 */
export interface RawBlock extends BaseBlock {
  type: 'raw';
  html: string;
}

/**
 * Navbar link definition
 */
export interface NavbarLink {
  href: string;
  label: string;
  color?: string;
}

/**
 * Navbar block for navigation
 */
export interface NavbarBlock extends BaseBlock {
  type: 'navbar';
  links: NavbarLink[];
  hamburger?: boolean;
  baseUrl?: string;
  align?: 'left' | 'center' | 'right';
  icoColor?: string;
  padding?: Spacing;
}

/**
 * Carousel image definition
 */
export interface CarouselImage {
  src: string;
  alt?: string;
  href?: string;
  thumbnailSrc?: string;
}

/**
 * Carousel block for image slideshows
 */
export interface CarouselBlock extends BaseBlock {
  type: 'carousel';
  images: CarouselImage[];
  thumbnails?: 'visible' | 'hidden';
  borderRadius?: string;
  iconWidth?: string;
  tbBorderRadius?: string;
  padding?: Spacing;
}

/**
 * Table block for tabular data
 */
export interface TableBlock extends BaseBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
  align?: 'left' | 'center' | 'right';
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  cellpadding?: string;
  cellspacing?: string;
  border?: string;
  padding?: Spacing;
}

/**
 * Union type of all possible blocks
 */
export type Block =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | HeaderBlock
  | FooterBlock
  | SocialBlock
  | HeroBlock
  | AccordionBlock
  | RawBlock
  | NavbarBlock
  | CarouselBlock
  | TableBlock;

/**
 * Column within a section
 */
export interface Column {
  id: string;
  width?: number; // Percentage (e.g., 50 for 50%)
  blocks: Block[];
  hidden?: boolean;
  backgroundColor?: string;
  backgroundGradient?: BackgroundGradient;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  padding?: Spacing;
  /**
   * Optional sub-columns. When non-empty, `blocks` MUST be empty
   * (a column is either a leaf with blocks, or a group with sub-columns).
   * See `docs/superpowers/specs/2026-04-26-nested-columns-design.md`.
   */
  subColumns?: SubColumn[];
  /** See {@link ExtraAttributes}. */
  extraAttributes?: ExtraAttributes;
}

/**
 * Sub-column inside a "group"-kind Column. Holds only leaf blocks
 * (text, image, button, divider, spacer, social). Cannot itself contain
 * sub-columns (no nesting beyond depth 2).
 */
export interface SubColumn {
  id: string;
  width: number; // Percentage of the parent column
  blocks: Block[];
  backgroundColor?: string;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
}

/**
 * Section containing columns
 */
export interface Section {
  id: string;
  type: 'section';
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundGradient?: BackgroundGradient;
  backgroundPosition?: string;
  backgroundRepeat?: 'repeat' | 'no-repeat';
  backgroundSize?: string;
  fullWidth?: boolean;
  isWrapper?: boolean;
  noStack?: boolean;
  hidden?: boolean;
  padding?: Spacing;
  columns: Column[];
  /**
   * Emit the section's raw blocks straight into `<mj-body>` instead of inside
   * an `<mj-section>`: markup that sat directly in the body of an imported
   * document. Ignored as soon as the section holds any block that is not raw.
   */
  bodyRaw?: boolean;
  /** See {@link ExtraAttributes}. On a wrapper section they go on `<mj-wrapper>`. */
  extraAttributes?: ExtraAttributes;
}

/**
 * Complete email template structure
 */
export interface EmailTemplate {
  /**
   * The document's id. Optional: a document without one is valid, and the
   * editor store assigns one when it opens it (see `TemplateModel`).
   * `migrateTemplate` never adds or changes it.
   */
  id?: string;
  version: '1.0';
  metadata: TemplateMetadata;
  sections: Section[];
}

/**
 * Result of MJML compilation
 */
export interface CompileResult {
  mjml: string;
  html: string;
  errors?: string[];
}

