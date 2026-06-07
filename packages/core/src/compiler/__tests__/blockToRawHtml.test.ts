import { describe, it, expect } from 'vitest';
import { blockToRawHtml } from '../blockToRawHtml';
import { BlockType } from '../../store/mst/models/BlockModel';

describe('blockToRawHtml', () => {
  it('renders a TEXT block as a div with HTML content and inline styles', () => {
    const html = blockToRawHtml({
      id: 't1',
      type: BlockType.TEXT,
      content: '<p>Hello</p>',
      align: 'left',
      color: '#222',
      fontSize: '14px',
      fontFamily: 'Georgia, serif',
      lineHeight: '1.6',
    } as any);
    expect(html).toContain('<div');
    expect(html).toContain('color:#222');
    expect(html).toContain('font-family:Georgia, serif');
    expect(html).toContain('text-align:left');
    expect(html).toContain('<p>Hello</p>');
  });

  it('renders an IMAGE block as an <img> with optional <a>', () => {
    const html = blockToRawHtml({
      id: 'i1', type: BlockType.IMAGE, src: 'https://x.test/y.png', alt: 'y', href: 'https://x.test',
    } as any);
    expect(html).toContain('<a href="https://x.test"');
    expect(html).toContain('<img src="https://x.test/y.png"');
    expect(html).toContain('alt="y"');
  });

  it('renders a BUTTON block as a table-wrapped anchor', () => {
    const html = blockToRawHtml({
      id: 'b1', type: BlockType.BUTTON, label: 'Go',
      href: 'https://x.test', backgroundColor: '#944923', color: '#fff', borderRadius: '4px',
    } as any);
    expect(html).toContain('<table');
    expect(html).toContain('background-color:#944923');
    expect(html).toContain('color:#fff');
    expect(html).toContain('href="https://x.test"');
    expect(html).toContain('>Go</a>');
  });

  it('renders DIVIDER as an hr-style table row', () => {
    const html = blockToRawHtml({
      id: 'd1', type: BlockType.DIVIDER, borderColor: '#ccc', borderWidth: '1px', borderStyle: 'solid',
    } as any);
    expect(html).toContain('border-top:1px solid #ccc');
  });

  it('renders SPACER with explicit height', () => {
    const html = blockToRawHtml({
      id: 's1', type: BlockType.SPACER, height: '20px',
    } as any);
    expect(html).toContain('height:20px');
  });

  it('renders SOCIAL as an inline icon row', () => {
    const html = blockToRawHtml({
      id: 'so1', type: BlockType.SOCIAL,
      links: [
        { platform: 'twitter', url: 'https://twitter.com/x', icon: 'https://i/tw.png' },
        { platform: 'instagram', url: 'https://instagram.com/x', icon: 'https://i/ig.png' },
      ],
    } as any);
    expect(html).toContain('href="https://twitter.com/x"');
    expect(html).toContain('src="https://i/tw.png"');
    expect(html).toContain('href="https://instagram.com/x"');
  });

  it('throws on a container block type', () => {
    expect(() =>
      blockToRawHtml({ id: 'h', type: BlockType.HERO } as any),
    ).toThrow(/leaf/i);
  });
});
