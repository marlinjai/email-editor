import { describe, it, expect } from 'vitest';
import { MJMLCompiler } from '../MJMLCompiler';
import type { EmailTemplate } from '../../schema/types';

function withFont(fontFamily: string, fonts?: { name: string; href: string }[]): EmailTemplate {
  return {
    version: '1.0',
    metadata: { title: 'Fonts', ...(fonts ? { fonts } : {}) },
    sections: [
      {
        id: 's1',
        type: 'section',
        columns: [{ id: 'c1', blocks: [{ id: 'b1', type: 'text', content: '<p>Hello</p>', fontFamily }] }],
      },
    ],
  } as unknown as EmailTemplate;
}

describe('MJMLCompiler webFonts option', () => {
  it('lets MJML import a Google font it knows by default', () => {
    const { html } = new MJMLCompiler().compile(withFont('Roboto, Arial, sans-serif'));
    expect(html).toContain('fonts.googleapis.com');
  });

  it('leaves the automatic Google Fonts imports out with webFonts: false', () => {
    const { html, errors } = new MJMLCompiler().compile(withFont('Roboto, Arial, sans-serif'), { webFonts: false });
    expect(errors).toBeUndefined();
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain('Roboto, Arial, sans-serif');
  });

  it('still emits fonts the document declares itself', () => {
    const { html } = new MJMLCompiler().compile(
      withFont('Brand, Arial', [{ name: 'Brand', href: 'https://mail.lumitra.co/fonts/brand.css' }]),
      { webFonts: false },
    );
    expect(html).toContain('https://mail.lumitra.co/fonts/brand.css');
  });
});
