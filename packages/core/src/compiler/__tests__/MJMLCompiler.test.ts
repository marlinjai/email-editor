import { describe, it, expect, beforeEach } from 'vitest';
import { MJMLCompiler, createMJMLCompiler } from '../MJMLCompiler';
import type { EmailTemplate } from '../../schema/types';

function makeMinimalTemplate(overrides?: Partial<EmailTemplate>): EmailTemplate {
  return {
    version: '1.0',
    metadata: {},
    sections: [],
    ...overrides,
  };
}

function makeTemplateWithBlock(block: any): EmailTemplate {
  return {
    version: '1.0',
    metadata: {},
    sections: [
      {
        id: 'sec-1',
        type: 'section',
        columns: [
          {
            id: 'col-1',
            blocks: [block],
          },
        ],
      },
    ],
  };
}

describe('createMJMLCompiler', () => {
  it('creates a MJMLCompiler instance', () => {
    const compiler = createMJMLCompiler();
    expect(compiler).toBeInstanceOf(MJMLCompiler);
  });
});

describe('MJMLCompiler', () => {
  let compiler: MJMLCompiler;

  beforeEach(() => {
    compiler = new MJMLCompiler();
  });

  describe('compile', () => {
    it('compiles a minimal empty template to HTML', () => {
      const result = compiler.compile(makeMinimalTemplate());
      expect(result.html).toBeDefined();
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.mjml).toContain('<mjml>');
      expect(result.mjml).toContain('</mjml>');
      expect(result.mjml).toContain('<mj-body>');
    });

    it('returns both mjml and html', () => {
      const result = compiler.compile(makeMinimalTemplate());
      expect(result.mjml).toBeTruthy();
      expect(result.html).toBeTruthy();
    });

    it('includes metadata title in head', () => {
      const result = compiler.compile(makeMinimalTemplate({
        metadata: { title: 'My Email' },
      }));
      expect(result.mjml).toContain('<mj-title>My Email</mj-title>');
    });

    it('includes metadata previewText in head', () => {
      const result = compiler.compile(makeMinimalTemplate({
        metadata: { previewText: 'Preview text here' },
      }));
      expect(result.mjml).toContain('<mj-preview>Preview text here</mj-preview>');
    });

    it('includes custom fonts in head', () => {
      const result = compiler.compile(makeMinimalTemplate({
        metadata: {
          fonts: [{ name: 'Roboto', href: 'https://fonts.googleapis.com/css?family=Roboto' }],
        },
      }));
      expect(result.mjml).toContain('mj-font');
      expect(result.mjml).toContain('Roboto');
    });

    it('includes breakpoint in head', () => {
      const result = compiler.compile(makeMinimalTemplate({
        metadata: { breakpoint: '480px' },
      }));
      expect(result.mjml).toContain('<mj-breakpoint width="480px"');
    });

    it('includes custom CSS in head', () => {
      const result = compiler.compile(makeMinimalTemplate({
        metadata: { customCSS: '.test { color: red; }' },
      }));
      expect(result.mjml).toContain('<mj-style>.test { color: red; }</mj-style>');
    });

    it('includes inline CSS in head', () => {
      const result = compiler.compile(makeMinimalTemplate({
        metadata: { inlineCSS: 'p { margin: 0; }' },
      }));
      expect(result.mjml).toContain('inline="inline"');
      expect(result.mjml).toContain('p { margin: 0; }');
    });
  });

  describe('text block', () => {
    it('generates mj-text tag', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 't1',
        type: 'text',
        content: '<p>Hello World</p>',
      }));
      expect(result.mjml).toContain('<mj-text');
      expect(result.mjml).toContain('Hello World');
    });

    it('includes align attribute', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 't2',
        type: 'text',
        content: 'Centered',
        align: 'center',
      }));
      expect(result.mjml).toContain('align="center"');
    });

    it('includes color and fontSize attributes', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 't3',
        type: 'text',
        content: 'Styled',
        color: '#ff0000',
        fontSize: '20px',
      }));
      expect(result.mjml).toContain('color="#ff0000"');
      expect(result.mjml).toContain('font-size="20px"');
    });
  });

  describe('image block', () => {
    it('generates mj-image tag', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'i1',
        type: 'image',
        src: 'https://example.com/img.png',
      }));
      expect(result.mjml).toContain('<mj-image');
      expect(result.mjml).toContain('src="https://example.com/img.png"');
    });

    it('includes alt, width, and href attributes', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'i2',
        type: 'image',
        src: 'img.jpg',
        alt: 'Photo',
        width: '300px',
        href: 'https://example.com',
      }));
      expect(result.mjml).toContain('alt="Photo"');
      expect(result.mjml).toContain('width="300px"');
      expect(result.mjml).toContain('href="https://example.com"');
    });
  });

  describe('button block', () => {
    it('generates mj-button tag', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'b1',
        type: 'button',
        label: 'Click Me',
        href: 'https://example.com',
      }));
      expect(result.mjml).toContain('<mj-button');
      expect(result.mjml).toContain('Click Me');
      expect(result.mjml).toContain('href="https://example.com"');
    });

    it('includes styling attributes', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'b2',
        type: 'button',
        label: 'Styled',
        href: '#',
        backgroundColor: '#ff0000',
        color: '#ffffff',
        borderRadius: '5px',
      }));
      expect(result.mjml).toContain('background-color="#ff0000"');
      expect(result.mjml).toContain('color="#ffffff"');
      expect(result.mjml).toContain('border-radius="5px"');
    });
  });

  describe('divider block', () => {
    it('generates mj-divider tag', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'd1',
        type: 'divider',
      }));
      expect(result.mjml).toContain('<mj-divider');
    });

    it('includes border attributes', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'd2',
        type: 'divider',
        borderColor: '#cccccc',
        borderWidth: '2px',
        borderStyle: 'dashed',
      }));
      expect(result.mjml).toContain('border-color="#cccccc"');
      expect(result.mjml).toContain('border-width="2px"');
      expect(result.mjml).toContain('border-style="dashed"');
    });
  });

  describe('spacer block', () => {
    it('generates mj-spacer tag with height', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 's1',
        type: 'spacer',
        height: '30px',
      }));
      expect(result.mjml).toContain('<mj-spacer');
      expect(result.mjml).toContain('height="30px"');
    });
  });

  describe('hero block', () => {
    it('generates mj-hero tag', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'h1',
        type: 'hero',
        backgroundImage: 'https://example.com/hero.jpg',
      }));
      expect(result.mjml).toContain('<mj-hero');
      expect(result.mjml).toContain('background-url="https://example.com/hero.jpg"');
    });
  });

  describe('accordion block', () => {
    it('generates mj-accordion tag with items', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'a1',
        type: 'accordion',
        items: [
          { title: 'Question 1', content: 'Answer 1' },
          { title: 'Question 2', content: 'Answer 2' },
        ],
      }));
      expect(result.mjml).toContain('<mj-accordion');
      expect(result.mjml).toContain('<mj-accordion-element>');
      expect(result.mjml).toContain('<mj-accordion-title>Question 1</mj-accordion-title>');
      expect(result.mjml).toContain('<mj-accordion-text>Answer 1</mj-accordion-text>');
      expect(result.mjml).toContain('Question 2');
    });
  });

  describe('raw block', () => {
    it('generates mj-raw tag', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'r1',
        type: 'raw',
        html: '<div>Custom HTML</div>',
      }));
      expect(result.mjml).toContain('<mj-raw');
      expect(result.mjml).toContain('<div>Custom HTML</div>');
    });
  });

  describe('navbar block', () => {
    it('generates mj-navbar tag with links', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'n1',
        type: 'navbar',
        links: [
          { label: 'Home', href: '/' },
          { label: 'About', href: '/about' },
        ],
      }));
      expect(result.mjml).toContain('<mj-navbar');
      expect(result.mjml).toContain('<mj-navbar-link');
      expect(result.mjml).toContain('Home');
      expect(result.mjml).toContain('About');
    });
  });

  describe('carousel block', () => {
    it('generates mj-carousel tag with images', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'c1',
        type: 'carousel',
        images: [
          { src: 'img1.jpg', alt: 'Image 1' },
          { src: 'img2.jpg' },
        ],
      }));
      expect(result.mjml).toContain('<mj-carousel');
      expect(result.mjml).toContain('<mj-carousel-image');
      expect(result.mjml).toContain('src="img1.jpg"');
      expect(result.mjml).toContain('alt="Image 1"');
      expect(result.mjml).toContain('src="img2.jpg"');
    });
  });

  describe('table block', () => {
    it('generates mj-table tag with rows', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'tbl1',
        type: 'table',
        headers: ['Name', 'Value'],
        rows: [['A', '1'], ['B', '2']],
      }));
      expect(result.mjml).toContain('<mj-table');
      expect(result.mjml).toContain('<th');
      expect(result.mjml).toContain('Name');
      expect(result.mjml).toContain('Value');
      expect(result.mjml).toContain('<td');
    });
  });

  describe('header block', () => {
    it('generates branded header MJML', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'hdr1',
        type: 'header',
        locked: true,
      }));
      expect(result.mjml).toContain('el-header');
      expect(result.mjml).toContain('Welcome to the ReTurn Newsletter');
    });
  });

  describe('footer block', () => {
    it('generates branded footer MJML', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'ftr1',
        type: 'footer',
        locked: true,
      }));
      expect(result.mjml).toContain('el-footer');
      expect(result.mjml).toContain('ReTurn Hypnosis');
      expect(result.mjml).toContain('Unsubscribe');
    });
  });

  describe('hidden blocks', () => {
    it('produces empty string for hidden blocks', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'hidden1',
        type: 'text',
        content: 'Should not appear',
        hidden: true,
      }));
      expect(result.mjml).not.toContain('Should not appear');
    });
  });

  describe('hidden sections', () => {
    it('produces empty string for hidden sections', () => {
      const result = compiler.compile({
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'hidden-sec',
            type: 'section' as const,
            hidden: true,
            columns: [
              {
                id: 'col-h',
                blocks: [{ id: 'b-h', type: 'text' as const, content: 'Hidden section content' }],
              },
            ],
          },
        ],
      });
      expect(result.mjml).not.toContain('Hidden section content');
    });
  });

  describe('compile produces valid HTML', () => {
    it('compiles a full template with multiple block types to HTML', () => {
      const template: EmailTemplate = {
        version: '1.0',
        metadata: { title: 'Full Test' },
        sections: [
          {
            id: 'sec-full',
            type: 'section',
            columns: [
              {
                id: 'col-full',
                blocks: [
                  { id: 'b1', type: 'text', content: '<p>Hello</p>' },
                  { id: 'b2', type: 'image', src: 'test.jpg' },
                  { id: 'b3', type: 'button', label: 'Click', href: '#' },
                  { id: 'b4', type: 'divider' },
                  { id: 'b5', type: 'spacer', height: '20px' },
                ],
              },
            ],
          },
        ],
      };
      const result = compiler.compile(template);
      expect(result.html).toContain('<!doctype html>');
      expect(result.html).toContain('Hello');
      expect(result.html).toContain('Click');
    });
  });

  describe('social block', () => {
    it('generates social icons markup', () => {
      const result = compiler.compile(makeTemplateWithBlock({
        id: 'soc1',
        type: 'social',
        links: [
          { platform: 'facebook', url: 'https://facebook.com' },
          { platform: 'twitter', url: 'https://twitter.com' },
        ],
      }));
      // Social block uses mj-raw for horizontal mode
      expect(result.mjml).toContain('facebook');
      expect(result.mjml).toContain('twitter');
    });
  });

  describe('gradient support', () => {
    it('injects a linear gradient as mj-style and css-class on section', () => {
      const template: EmailTemplate = {
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'sec-grad',
            type: 'section',
            backgroundGradient: {
              type: 'linear',
              angle: 135,
              stops: [
                { color: '#ff0000', position: 0 },
                { color: '#0000ff', position: 100 },
              ],
            },
            columns: [{ id: 'col-1', blocks: [] }],
          },
        ],
      };
      const compiler = new MJMLCompiler();
      const result = compiler.compile(template);
      expect(result.mjml).toContain('linear-gradient(135deg, #ff0000 0%, #0000ff 100%)');
      expect(result.mjml).toContain('el-grad-sec-grad');
      expect(result.mjml).toContain('<mj-style>');
    });

    it('uses first stop color as background-color fallback for Outlook', () => {
      const template: EmailTemplate = {
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'sec-grad',
            type: 'section',
            backgroundGradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: '#abcdef', position: 0 },
                { color: '#fedcba', position: 100 },
              ],
            },
            columns: [{ id: 'col-1', blocks: [] }],
          },
        ],
      };
      const compiler = new MJMLCompiler();
      const result = compiler.compile(template);
      expect(result.mjml).toContain('background-color="#abcdef"');
    });

    it('does not inject mj-style when no gradients exist', () => {
      const template: EmailTemplate = {
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'sec-1',
            type: 'section',
            backgroundColor: '#ffffff',
            columns: [{ id: 'col-1', blocks: [] }],
          },
        ],
      };
      const compiler = new MJMLCompiler();
      const result = compiler.compile(template);
      expect(result.mjml).not.toContain('el-grad-');
    });
  });

  describe('section features', () => {
    it('supports full-width sections', () => {
      const result = compiler.compile({
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'fw-sec',
            type: 'section' as const,
            fullWidth: true,
            columns: [{ id: 'c', blocks: [] }],
          },
        ],
      });
      expect(result.mjml).toContain('full-width="full-width"');
    });

    it('supports wrapper sections', () => {
      const result = compiler.compile({
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'wrap-sec',
            type: 'section' as const,
            isWrapper: true,
            columns: [{ id: 'c', blocks: [] }],
          },
        ],
      });
      expect(result.mjml).toContain('<mj-wrapper');
    });

    it('supports noStack with mj-group', () => {
      const result = compiler.compile({
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'ns-sec',
            type: 'section' as const,
            noStack: true,
            columns: [
              { id: 'c1', blocks: [] },
              { id: 'c2', blocks: [] },
            ],
          },
        ],
      });
      expect(result.mjml).toContain('<mj-group>');
    });

    it('supports background color on sections', () => {
      const result = compiler.compile({
        version: '1.0',
        metadata: {},
        sections: [
          {
            id: 'bg-sec',
            type: 'section' as const,
            backgroundColor: '#ff0000',
            columns: [{ id: 'c', blocks: [] }],
          },
        ],
      });
      expect(result.mjml).toContain('background-color="#ff0000"');
    });
  });
});
