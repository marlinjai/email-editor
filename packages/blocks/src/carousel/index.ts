// packages/blocks/src/carousel/index.ts
// Carousel block for image galleries
// Maps to MJML's <mj-carousel> component

import type { BlockDefinition, CarouselBlock } from '@marlinjai/email-editor-core';
import { CarouselBlockSchema } from '@marlinjai/email-editor-core';

/**
 * Carousel block definition
 * Creates an interactive image gallery with optional thumbnails
 */
export const carouselBlockDefinition: BlockDefinition<CarouselBlock> = {
  type: 'carousel',
  label: 'Carousel',
  category: 'media',
  description: 'Image gallery with navigation',
  defaultProps: {
    images: [
      { src: 'https://placehold.co/600x300/944923/ffffff?text=Slide+1', alt: 'Slide 1' },
      { src: 'https://placehold.co/600x300/666666/ffffff?text=Slide+2', alt: 'Slide 2' },
      { src: 'https://placehold.co/600x300/333333/ffffff?text=Slide+3', alt: 'Slide 3' },
    ],
    thumbnails: 'visible',
    borderRadius: '6px',
  },
  propSchema: CarouselBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`css-class="el-carousel el-${block.id}"`];

    if (block.thumbnails) attrs.push(`thumbnails="${block.thumbnails}"`);
    if (block.borderRadius) attrs.push(`border-radius="${block.borderRadius}"`);
    if (block.iconWidth) attrs.push(`icon-width="${block.iconWidth}"`);
    if (block.tbBorderRadius) attrs.push(`tb-border-radius="${block.tbBorderRadius}"`);
    if (block.padding) {
      const padding = [
        block.padding.top,
        block.padding.right,
        block.padding.bottom,
        block.padding.left,
      ]
        .filter(Boolean)
        .join(' ');
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const images = block.images
      .map((img) => {
        const imgAttrs: string[] = [`src="${img.src}"`];
        if (img.alt) imgAttrs.push(`alt="${img.alt}"`);
        if (img.href) imgAttrs.push(`href="${img.href}"`);
        if (img.thumbnailSrc) imgAttrs.push(`thumbnails-src="${img.thumbnailSrc}"`);
        return `<mj-carousel-image ${imgAttrs.join(' ')} />`;
      })
      .join('\n    ');

    return `
<mj-carousel ${attrs.join(' ')}>
    ${images}
</mj-carousel>
    `.trim();
  },
};

