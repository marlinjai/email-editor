// packages/core/src/schema/types.ts
// Core type definitions for email templates

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
 * Email template metadata
 */
export interface TemplateMetadata {
  subject?: string;
  previewText?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Base block interface - all blocks extend this
 */
export interface BaseBlock {
  id: string;
  type: string;
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
  href?: string; // Make image clickable
  padding?: Spacing;
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
 * Union type of all possible blocks
 */
export type Block =
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | HeaderBlock
  | FooterBlock;

/**
 * Column within a section
 */
export interface Column {
  id: string;
  width?: number; // Percentage (e.g., 50 for 50%)
  blocks: Block[];
}

/**
 * Section containing columns
 */
export interface Section {
  id: string;
  type: 'section';
  backgroundColor?: string;
  backgroundImage?: string;
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

