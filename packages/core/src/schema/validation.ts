// packages/core/src/schema/validation.ts
// Zod schemas for runtime validation

import { z } from 'zod';
import type { BackgroundGradient } from './gradient';

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
 * Gradient stop schema
 */
export const GradientStopSchema = z.object({
  color: z.string().min(1),
  position: z.number().min(0).max(100),
});

/**
 * Background gradient schema
 */
export const BackgroundGradientSchema = z.object({
  type: z.enum(['linear', 'radial']),
  angle: z.number().min(0).max(360),
  stops: z.array(GradientStopSchema).min(1),
}) satisfies z.ZodType<BackgroundGradient>;

/**
 * Custom font schema
 */
export const CustomFontSchema = z.object({
  name: z.string(),
  href: z.string(),
});

/**
 * Inferred type for custom font
 */
export type CustomFont = z.infer<typeof CustomFontSchema>;

/**
 * Template metadata schema
 * Includes head component settings
 */
export const TemplateMetadataSchema = z.object({
  name: z.string().optional(),
  subject: z.string().optional(),
  previewText: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // Head component settings
  fonts: z.array(CustomFontSchema).optional(),
  breakpoint: z.string().optional(),
  customCSS: z.string().optional(),
  inlineCSS: z.string().optional(),
});

/**
 * Text block schema
 */
export const TextBlockSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  hidden: z.boolean().optional(),
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
  hidden: z.boolean().optional(),
  src: z.string().min(1), // Allow any non-empty string, not just URLs
  alt: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  href: z.string().optional(), // Allow any string for link
  padding: SpacingSchema.optional(),
  borderRadius: z.string().optional(), // Rounded corners
});

/**
 * Button block schema
 */
export const ButtonBlockSchema = z.object({
  id: z.string(),
  type: z.literal('button'),
  hidden: z.boolean().optional(),
  label: z.string().min(1),
  href: z.string().min(1), // Allow any non-empty string
  align: z.enum(['left', 'center', 'right']).optional(),
  backgroundColor: z.string().optional(),
  color: z.string().optional(),
  borderRadius: z.string().optional(),
  border: z.string().optional(), // CSS border shorthand
  padding: SpacingSchema.optional(),
  innerPadding: z.string().optional(),
});

/**
 * Divider block schema
 */
export const DividerBlockSchema = z.object({
  id: z.string(),
  type: z.literal('divider'),
  hidden: z.boolean().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.string().optional(),
  borderStyle: z.enum(['solid', 'dashed', 'dotted']).optional(),
  width: z.string().optional(), // Width of the divider line
  padding: SpacingSchema.optional(),
});

/**
 * Spacer block schema
 */
export const SpacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal('spacer'),
  hidden: z.boolean().optional(),
  height: z.string(),
});

/**
 * Header block schema
 */
export const HeaderBlockSchema = z.object({
  id: z.string(),
  type: z.literal('header'),
  hidden: z.boolean().optional(),
  locked: z.literal(true),
});

/**
 * Footer block schema
 */
export const FooterBlockSchema = z.object({
  id: z.string(),
  type: z.literal('footer'),
  hidden: z.boolean().optional(),
  locked: z.literal(true),
});

/**
 * Social block schema
 * Renders as buttons with icon images instead of mj-social for reliable sizing
 */
export const SocialBlockSchema = z.object({
  id: z.string(),
  type: z.literal('social'),
  hidden: z.boolean().optional(),
  mode: z.enum(['horizontal', 'vertical']).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  iconSize: z.string().optional(),
  iconPadding: z.string().optional(),
  borderRadius: z.string().optional(), // For round icons
  links: z.array(
    z.object({
      platform: z.enum(['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'pinterest', 'github']),
      url: z.string(),
      color: z.string().optional(), // Per-icon color override (uses platform default if not set)
    })
  ),
});

/**
 * Hero block schema
 */
export const HeroBlockSchema = z.object({
  id: z.string(),
  type: z.literal('hero'),
  hidden: z.boolean().optional(),
  backgroundImage: z.string().min(1),
  backgroundHeight: z.string().optional(),
  backgroundWidth: z.string().optional(),
  backgroundColor: z.string().optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  mode: z.enum(['fluid-height', 'fixed-height']).optional(),
});

/**
 * Accordion block schema
 */
export const AccordionBlockSchema = z.object({
  id: z.string(),
  type: z.literal('accordion'),
  hidden: z.boolean().optional(),
  items: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
    })
  ),
  iconPosition: z.enum(['left', 'right']).optional(),
  borderColor: z.string().optional(),
  fontFamily: z.string().optional(),
});

/**
 * Raw HTML block schema
 */
export const RawBlockSchema = z.object({
  id: z.string(),
  type: z.literal('raw'),
  hidden: z.boolean().optional(),
  html: z.string(),
});

/**
 * Navbar block schema
 */
export const NavbarBlockSchema = z.object({
  id: z.string(),
  type: z.literal('navbar'),
  hidden: z.boolean().optional(),
  links: z.array(
    z.object({
      label: z.string(),
      href: z.string(),
      color: z.string().optional(),
    })
  ),
  hamburger: z.boolean().optional(),
  baseUrl: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  icoColor: z.string().optional(),
  padding: SpacingSchema.optional(),
});

/**
 * Carousel block schema
 */
export const CarouselBlockSchema = z.object({
  id: z.string(),
  type: z.literal('carousel'),
  hidden: z.boolean().optional(),
  images: z.array(
    z.object({
      src: z.string(),
      alt: z.string().optional(),
      href: z.string().optional(),
      thumbnailSrc: z.string().optional(),
    })
  ),
  thumbnails: z.enum(['visible', 'hidden']).optional(),
  borderRadius: z.string().optional(),
  iconWidth: z.string().optional(),
  tbBorderRadius: z.string().optional(),
  padding: SpacingSchema.optional(),
});

/**
 * Table block schema
 */
export const TableBlockSchema = z.object({
  id: z.string(),
  type: z.literal('table'),
  hidden: z.boolean().optional(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  align: z.enum(['left', 'center', 'right']).optional(),
  color: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  cellpadding: z.string().optional(),
  cellspacing: z.string().optional(),
  border: z.string().optional(),
  padding: SpacingSchema.optional(),
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
  SocialBlockSchema,
  HeroBlockSchema,
  AccordionBlockSchema,
  RawBlockSchema,
  NavbarBlockSchema,
  CarouselBlockSchema,
  TableBlockSchema,
]);

/**
 * Column schema
 */
export const ColumnSchema = z.object({
  id: z.string(),
  width: z.number().min(0).max(100).optional(),
  backgroundColor: z.string().optional(),
  backgroundGradient: BackgroundGradientSchema.optional(),
  padding: SpacingSchema.optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(), // Vertical content alignment
  hidden: z.boolean().optional(),
  blocks: z.array(BlockSchema),
});

/**
 * Section schema
 */
export const SectionSchema = z.object({
  id: z.string(),
  type: z.literal('section'),
  backgroundColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundPosition: z.string().optional(),
  backgroundRepeat: z.enum(['repeat', 'no-repeat']).optional(),
  backgroundSize: z.string().optional(),
  backgroundGradient: BackgroundGradientSchema.optional(),
  padding: SpacingSchema.optional(),
  noStack: z.boolean().optional(),
  fullWidth: z.boolean().optional(),
  isWrapper: z.boolean().optional(),
  hidden: z.boolean().optional(),
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

