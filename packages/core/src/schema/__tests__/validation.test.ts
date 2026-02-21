import { describe, it, expect } from 'vitest';
import {
  SpacingSchema,
  CustomFontSchema,
  TemplateMetadataSchema,
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
  BlockSchema,
  ColumnSchema,
  SectionSchema,
  EmailTemplateSchema,
  validateTemplate,
} from '../validation';

// --- SpacingSchema ---

describe('SpacingSchema', () => {
  it('accepts valid spacing with all fields', () => {
    const result = SpacingSchema.safeParse({ top: '10px', right: '20px', bottom: '10px', left: '20px' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = SpacingSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial spacing', () => {
    const result = SpacingSchema.safeParse({ top: '10px' });
    expect(result.success).toBe(true);
  });
});

// --- CustomFontSchema ---

describe('CustomFontSchema', () => {
  it('accepts valid font', () => {
    const result = CustomFontSchema.safeParse({ name: 'Roboto', href: 'https://fonts.googleapis.com/css?family=Roboto' });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = CustomFontSchema.safeParse({ href: 'https://fonts.googleapis.com' });
    expect(result.success).toBe(false);
  });

  it('rejects missing href', () => {
    const result = CustomFontSchema.safeParse({ name: 'Roboto' });
    expect(result.success).toBe(false);
  });
});

// --- TemplateMetadataSchema ---

describe('TemplateMetadataSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = TemplateMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts full metadata', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'My Template',
      subject: 'Hello',
      previewText: 'Preview',
      title: 'Title',
      fonts: [{ name: 'Roboto', href: 'https://fonts.googleapis.com' }],
      breakpoint: '480px',
      customCSS: '.test { color: red; }',
      inlineCSS: 'p { margin: 0; }',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid fonts array', () => {
    const result = TemplateMetadataSchema.safeParse({
      fonts: [{ name: 'Roboto' }], // missing href
    });
    expect(result.success).toBe(false);
  });
});

// --- TextBlockSchema ---

describe('TextBlockSchema', () => {
  it('accepts valid text block', () => {
    const result = TextBlockSchema.safeParse({
      id: 'block-1',
      type: 'text',
      content: '<p>Hello</p>',
    });
    expect(result.success).toBe(true);
  });

  it('accepts text block with all optional fields', () => {
    const result = TextBlockSchema.safeParse({
      id: 'block-1',
      type: 'text',
      content: '<p>Hello</p>',
      align: 'center',
      color: '#000000',
      fontSize: '16px',
      fontFamily: 'Georgia, serif',
      lineHeight: '1.5',
      hidden: true,
      padding: { top: '10px' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing content', () => {
    const result = TextBlockSchema.safeParse({
      id: 'block-1',
      type: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid align enum', () => {
    const result = TextBlockSchema.safeParse({
      id: 'block-1',
      type: 'text',
      content: 'Hi',
      align: 'middle',
    });
    expect(result.success).toBe(false);
  });

  it('validates align enum values', () => {
    for (const align of ['left', 'center', 'right', 'justify']) {
      const result = TextBlockSchema.safeParse({ id: 'b', type: 'text', content: 'x', align });
      expect(result.success).toBe(true);
    }
  });
});

// --- ImageBlockSchema ---

describe('ImageBlockSchema', () => {
  it('accepts valid image block', () => {
    const result = ImageBlockSchema.safeParse({
      id: 'img-1',
      type: 'image',
      src: 'https://example.com/img.png',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty src', () => {
    const result = ImageBlockSchema.safeParse({
      id: 'img-1',
      type: 'image',
      src: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing src', () => {
    const result = ImageBlockSchema.safeParse({
      id: 'img-1',
      type: 'image',
    });
    expect(result.success).toBe(false);
  });

  it('validates align enum', () => {
    for (const align of ['left', 'center', 'right']) {
      const result = ImageBlockSchema.safeParse({ id: 'b', type: 'image', src: 'img.png', align });
      expect(result.success).toBe(true);
    }
  });
});

// --- ButtonBlockSchema ---

describe('ButtonBlockSchema', () => {
  it('accepts valid button block', () => {
    const result = ButtonBlockSchema.safeParse({
      id: 'btn-1',
      type: 'button',
      label: 'Click me',
      href: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty label', () => {
    const result = ButtonBlockSchema.safeParse({
      id: 'btn-1',
      type: 'button',
      label: '',
      href: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty href', () => {
    const result = ButtonBlockSchema.safeParse({
      id: 'btn-1',
      type: 'button',
      label: 'Click',
      href: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing label', () => {
    const result = ButtonBlockSchema.safeParse({
      id: 'btn-1',
      type: 'button',
      href: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });
});

// --- DividerBlockSchema ---

describe('DividerBlockSchema', () => {
  it('accepts valid divider block', () => {
    const result = DividerBlockSchema.safeParse({
      id: 'div-1',
      type: 'divider',
    });
    expect(result.success).toBe(true);
  });

  it('accepts divider with all optional fields', () => {
    const result = DividerBlockSchema.safeParse({
      id: 'div-1',
      type: 'divider',
      borderColor: '#ccc',
      borderWidth: '1px',
      borderStyle: 'dashed',
      width: '80%',
      padding: { top: '10px', bottom: '10px' },
    });
    expect(result.success).toBe(true);
  });

  it('validates borderStyle enum', () => {
    for (const borderStyle of ['solid', 'dashed', 'dotted']) {
      const result = DividerBlockSchema.safeParse({ id: 'b', type: 'divider', borderStyle });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid borderStyle', () => {
    const result = DividerBlockSchema.safeParse({
      id: 'div-1',
      type: 'divider',
      borderStyle: 'double',
    });
    expect(result.success).toBe(false);
  });
});

// --- SpacerBlockSchema ---

describe('SpacerBlockSchema', () => {
  it('accepts valid spacer block', () => {
    const result = SpacerBlockSchema.safeParse({
      id: 'spc-1',
      type: 'spacer',
      height: '20px',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing height', () => {
    const result = SpacerBlockSchema.safeParse({
      id: 'spc-1',
      type: 'spacer',
    });
    expect(result.success).toBe(false);
  });
});

// --- HeaderBlockSchema ---

describe('HeaderBlockSchema', () => {
  it('accepts valid header block', () => {
    const result = HeaderBlockSchema.safeParse({
      id: 'hdr-1',
      type: 'header',
      locked: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects locked: false', () => {
    const result = HeaderBlockSchema.safeParse({
      id: 'hdr-1',
      type: 'header',
      locked: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing locked', () => {
    const result = HeaderBlockSchema.safeParse({
      id: 'hdr-1',
      type: 'header',
    });
    expect(result.success).toBe(false);
  });
});

// --- FooterBlockSchema ---

describe('FooterBlockSchema', () => {
  it('accepts valid footer block', () => {
    const result = FooterBlockSchema.safeParse({
      id: 'ftr-1',
      type: 'footer',
      locked: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects locked: false', () => {
    const result = FooterBlockSchema.safeParse({
      id: 'ftr-1',
      type: 'footer',
      locked: false,
    });
    expect(result.success).toBe(false);
  });
});

// --- SocialBlockSchema ---

describe('SocialBlockSchema', () => {
  it('accepts valid social block', () => {
    const result = SocialBlockSchema.safeParse({
      id: 'soc-1',
      type: 'social',
      links: [{ platform: 'facebook', url: 'https://facebook.com' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts social block with all optional fields', () => {
    const result = SocialBlockSchema.safeParse({
      id: 'soc-1',
      type: 'social',
      mode: 'vertical',
      align: 'center',
      iconSize: '40px',
      iconPadding: '8px',
      borderRadius: '50%',
      links: [
        { platform: 'twitter', url: 'https://twitter.com', color: '#1DA1F2' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates platform enum', () => {
    const validPlatforms = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'pinterest', 'github'];
    for (const platform of validPlatforms) {
      const result = SocialBlockSchema.safeParse({
        id: 'b', type: 'social', links: [{ platform, url: 'https://example.com' }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid platform', () => {
    const result = SocialBlockSchema.safeParse({
      id: 'soc-1',
      type: 'social',
      links: [{ platform: 'tiktok', url: 'https://tiktok.com' }],
    });
    expect(result.success).toBe(false);
  });

  it('validates mode enum', () => {
    for (const mode of ['horizontal', 'vertical']) {
      const result = SocialBlockSchema.safeParse({
        id: 'b', type: 'social', links: [{ platform: 'facebook', url: 'https://fb.com' }], mode,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing links', () => {
    const result = SocialBlockSchema.safeParse({
      id: 'soc-1',
      type: 'social',
    });
    expect(result.success).toBe(false);
  });
});

// --- HeroBlockSchema ---

describe('HeroBlockSchema', () => {
  it('accepts valid hero block', () => {
    const result = HeroBlockSchema.safeParse({
      id: 'hero-1',
      type: 'hero',
      backgroundImage: 'https://example.com/hero.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty backgroundImage', () => {
    const result = HeroBlockSchema.safeParse({
      id: 'hero-1',
      type: 'hero',
      backgroundImage: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing backgroundImage', () => {
    const result = HeroBlockSchema.safeParse({
      id: 'hero-1',
      type: 'hero',
    });
    expect(result.success).toBe(false);
  });

  it('validates verticalAlign enum', () => {
    for (const verticalAlign of ['top', 'middle', 'bottom']) {
      const result = HeroBlockSchema.safeParse({
        id: 'b', type: 'hero', backgroundImage: 'img.jpg', verticalAlign,
      });
      expect(result.success).toBe(true);
    }
  });

  it('validates mode enum', () => {
    for (const mode of ['fluid-height', 'fixed-height']) {
      const result = HeroBlockSchema.safeParse({
        id: 'b', type: 'hero', backgroundImage: 'img.jpg', mode,
      });
      expect(result.success).toBe(true);
    }
  });
});

// --- AccordionBlockSchema ---

describe('AccordionBlockSchema', () => {
  it('accepts valid accordion block', () => {
    const result = AccordionBlockSchema.safeParse({
      id: 'acc-1',
      type: 'accordion',
      items: [{ title: 'Q1', content: 'A1' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing items', () => {
    const result = AccordionBlockSchema.safeParse({
      id: 'acc-1',
      type: 'accordion',
    });
    expect(result.success).toBe(false);
  });

  it('rejects items with missing title', () => {
    const result = AccordionBlockSchema.safeParse({
      id: 'acc-1',
      type: 'accordion',
      items: [{ content: 'A1' }],
    });
    expect(result.success).toBe(false);
  });

  it('validates iconPosition enum', () => {
    for (const iconPosition of ['left', 'right']) {
      const result = AccordionBlockSchema.safeParse({
        id: 'b', type: 'accordion', items: [{ title: 'T', content: 'C' }], iconPosition,
      });
      expect(result.success).toBe(true);
    }
  });
});

// --- RawBlockSchema ---

describe('RawBlockSchema', () => {
  it('accepts valid raw block', () => {
    const result = RawBlockSchema.safeParse({
      id: 'raw-1',
      type: 'raw',
      html: '<div>Custom</div>',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing html', () => {
    const result = RawBlockSchema.safeParse({
      id: 'raw-1',
      type: 'raw',
    });
    expect(result.success).toBe(false);
  });
});

// --- NavbarBlockSchema ---

describe('NavbarBlockSchema', () => {
  it('accepts valid navbar block', () => {
    const result = NavbarBlockSchema.safeParse({
      id: 'nav-1',
      type: 'navbar',
      links: [{ label: 'Home', href: '/' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing links', () => {
    const result = NavbarBlockSchema.safeParse({
      id: 'nav-1',
      type: 'navbar',
    });
    expect(result.success).toBe(false);
  });

  it('rejects links with missing label', () => {
    const result = NavbarBlockSchema.safeParse({
      id: 'nav-1',
      type: 'navbar',
      links: [{ href: '/' }],
    });
    expect(result.success).toBe(false);
  });
});

// --- CarouselBlockSchema ---

describe('CarouselBlockSchema', () => {
  it('accepts valid carousel block', () => {
    const result = CarouselBlockSchema.safeParse({
      id: 'car-1',
      type: 'carousel',
      images: [{ src: 'img1.jpg' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing images', () => {
    const result = CarouselBlockSchema.safeParse({
      id: 'car-1',
      type: 'carousel',
    });
    expect(result.success).toBe(false);
  });

  it('validates thumbnails enum', () => {
    for (const thumbnails of ['visible', 'hidden']) {
      const result = CarouselBlockSchema.safeParse({
        id: 'b', type: 'carousel', images: [{ src: 'a.jpg' }], thumbnails,
      });
      expect(result.success).toBe(true);
    }
  });
});

// --- TableBlockSchema ---

describe('TableBlockSchema', () => {
  it('accepts valid table block', () => {
    const result = TableBlockSchema.safeParse({
      id: 'tbl-1',
      type: 'table',
      headers: ['Name', 'Value'],
      rows: [['A', '1'], ['B', '2']],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing headers', () => {
    const result = TableBlockSchema.safeParse({
      id: 'tbl-1',
      type: 'table',
      rows: [['A', '1']],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing rows', () => {
    const result = TableBlockSchema.safeParse({
      id: 'tbl-1',
      type: 'table',
      headers: ['Name'],
    });
    expect(result.success).toBe(false);
  });
});

// --- BlockSchema (discriminated union) ---

describe('BlockSchema', () => {
  it('discriminates text block', () => {
    const result = BlockSchema.safeParse({ id: 'b', type: 'text', content: 'hi' });
    expect(result.success).toBe(true);
  });

  it('discriminates image block', () => {
    const result = BlockSchema.safeParse({ id: 'b', type: 'image', src: 'img.jpg' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown block type', () => {
    const result = BlockSchema.safeParse({ id: 'b', type: 'unknown' });
    expect(result.success).toBe(false);
  });
});

// --- ColumnSchema ---

describe('ColumnSchema', () => {
  it('accepts valid column with blocks', () => {
    const result = ColumnSchema.safeParse({
      id: 'col-1',
      blocks: [{ id: 'b', type: 'text', content: 'hi' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts column with empty blocks array', () => {
    const result = ColumnSchema.safeParse({ id: 'col-1', blocks: [] });
    expect(result.success).toBe(true);
  });

  it('rejects missing blocks', () => {
    const result = ColumnSchema.safeParse({ id: 'col-1' });
    expect(result.success).toBe(false);
  });

  it('validates width range (0-100)', () => {
    expect(ColumnSchema.safeParse({ id: 'c', width: 50, blocks: [] }).success).toBe(true);
    expect(ColumnSchema.safeParse({ id: 'c', width: 0, blocks: [] }).success).toBe(true);
    expect(ColumnSchema.safeParse({ id: 'c', width: 100, blocks: [] }).success).toBe(true);
    expect(ColumnSchema.safeParse({ id: 'c', width: -1, blocks: [] }).success).toBe(false);
    expect(ColumnSchema.safeParse({ id: 'c', width: 101, blocks: [] }).success).toBe(false);
  });
});

// --- SectionSchema ---

describe('SectionSchema', () => {
  it('accepts valid section', () => {
    const result = SectionSchema.safeParse({
      id: 'sec-1',
      type: 'section',
      columns: [{ id: 'col-1', blocks: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty columns array', () => {
    const result = SectionSchema.safeParse({
      id: 'sec-1',
      type: 'section',
      columns: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing columns', () => {
    const result = SectionSchema.safeParse({
      id: 'sec-1',
      type: 'section',
    });
    expect(result.success).toBe(false);
  });

  it('validates backgroundRepeat enum', () => {
    for (const backgroundRepeat of ['repeat', 'no-repeat']) {
      const result = SectionSchema.safeParse({
        id: 's', type: 'section', columns: [{ id: 'c', blocks: [] }], backgroundRepeat,
      });
      expect(result.success).toBe(true);
    }
  });
});

// --- EmailTemplateSchema ---

describe('EmailTemplateSchema', () => {
  it('accepts valid minimal template', () => {
    const result = EmailTemplateSchema.safeParse({
      version: '1.0',
      metadata: {},
      sections: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts full template', () => {
    const result = EmailTemplateSchema.safeParse({
      version: '1.0',
      metadata: { title: 'Test', subject: 'Subject' },
      sections: [
        {
          id: 'sec-1',
          type: 'section',
          columns: [
            {
              id: 'col-1',
              blocks: [
                { id: 'b1', type: 'text', content: 'Hello' },
                { id: 'b2', type: 'image', src: 'img.jpg' },
              ],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid version', () => {
    const result = EmailTemplateSchema.safeParse({
      version: '2.0',
      metadata: {},
      sections: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing metadata', () => {
    const result = EmailTemplateSchema.safeParse({
      version: '1.0',
      sections: [],
    });
    expect(result.success).toBe(false);
  });
});

// --- validateTemplate ---

describe('validateTemplate', () => {
  it('returns success for valid template', () => {
    const result = validateTemplate({
      version: '1.0',
      metadata: {},
      sections: [],
    });
    expect(result.success).toBe(true);
  });

  it('returns error for invalid template', () => {
    const result = validateTemplate({ version: '3.0' });
    expect(result.success).toBe(false);
  });
});
