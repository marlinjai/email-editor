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
 * Email template metadata
 */
export interface TemplateMetadata {
  subject?: string;
  previewText?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  fonts?: FontDefinition[];
  themeColors?: ThemeColor[];
  breakpoint?: string;
  customCSS?: string;
  inlineCSS?: string;
}

/**
 * Base block interface - all blocks extend this
 */
export interface BaseBlock {
  id: string;
  type: string;
  hidden?: boolean;
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
}

/**
 * Section containing columns
 */
export interface Section {
  id: string;
  type: 'section';
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundRepeat?: 'repeat' | 'no-repeat';
  backgroundSize?: string;
  backgroundGradient?: BackgroundGradient;
  fullWidth?: boolean;
  isWrapper?: boolean;
  noStack?: boolean;
  hidden?: boolean;
  padding?: Spacing;
  columns: Column[];
}

/**
 * Complete email template structure
 */
export interface EmailTemplate {
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

