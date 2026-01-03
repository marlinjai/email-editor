// packages/core/src/schema/validation.ts
// Zod schemas for runtime validation

import { z } from 'zod';

/**
 * Spacing schema
 */
export const SpacingSchema = z.object({
  top: z.string().optional(),
  right: z.string().optional(),
  bottom: z.string().optional(),
  left: z.string().optional(),
});

/**
 * Template metadata schema
 */
export const TemplateMetadataSchema = z.object({
  subject: z.string().optional(),
  previewText: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * Text block schema
 */
export const TextBlockSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  content: z.string(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  color: z.string().optional(),
  fontSize: z.string().optional(),
  fontFamily: z.string().optional(),
  padding: SpacingSchema.optional(),
  lineHeight: z.string().optional(),
});

/**
 * Image block schema
 */
export const ImageBlockSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  src: z.string().url(),
  alt: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  href: z.string().url().optional(),
  padding: SpacingSchema.optional(),
});

/**
 * Button block schema
 */
export const ButtonBlockSchema = z.object({
  id: z.string(),
  type: z.literal('button'),
  label: z.string().min(1),
  href: z.string().url(),
  align: z.enum(['left', 'center', 'right']).optional(),
  backgroundColor: z.string().optional(),
  color: z.string().optional(),
  borderRadius: z.string().optional(),
  padding: SpacingSchema.optional(),
  innerPadding: z.string().optional(),
});

/**
 * Divider block schema
 */
export const DividerBlockSchema = z.object({
  id: z.string(),
  type: z.literal('divider'),
  borderColor: z.string().optional(),
  borderWidth: z.string().optional(),
  borderStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  padding: SpacingSchema.optional(),
});

/**
 * Spacer block schema
 */
export const SpacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal('spacer'),
  height: z.string(),
});

/**
 * Header block schema
 */
export const HeaderBlockSchema = z.object({
  id: z.string(),
  type: z.literal('header'),
  locked: z.literal(true),
});

/**
 * Footer block schema
 */
export const FooterBlockSchema = z.object({
  id: z.string(),
  type: z.literal('footer'),
  locked: z.literal(true),
});

/**
 * Union schema for all block types
 */
export const BlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  ButtonBlockSchema,
  DividerBlockSchema,
  SpacerBlockSchema,
  HeaderBlockSchema,
  FooterBlockSchema,
]);

/**
 * Column schema
 */
export const ColumnSchema = z.object({
  id: z.string(),
  width: z.number().min(0).max(100).optional(),
  blocks: z.array(BlockSchema),
});

/**
 * Section schema
 */
export const SectionSchema = z.object({
  id: z.string(),
  type: z.literal('section'),
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().url().optional(),
  padding: SpacingSchema.optional(),
  columns: z.array(ColumnSchema).min(1),
});

/**
 * Complete email template schema
 */
export const EmailTemplateSchema = z.object({
  version: z.literal('1.0'),
  metadata: TemplateMetadataSchema,
  sections: z.array(SectionSchema),
});

/**
 * Validate an email template
 */
export function validateTemplate(template: unknown) {
  return EmailTemplateSchema.safeParse(template);
}

