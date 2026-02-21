import { describe, it, expect } from 'vitest';
import { injectTrackingPixel, rewriteLinksForTracking } from '../tracking';

describe('injectTrackingPixel', () => {
  const baseUrl = 'https://track.example.com';

  it('should inject pixel before </body>', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const result = injectTrackingPixel(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('<img src="https://track.example.com/track/open?cid=camp1&rid=contact1"');
    expect(result).toContain('width="1" height="1"');
    expect(result).toContain('style="display:none;width:1px;height:1px;border:0;"');
    expect(result.indexOf('<img')).toBeLessThan(result.indexOf('</body>'));
  });

  it('should append pixel if no </body> tag', () => {
    const html = '<p>Hello</p>';
    const result = injectTrackingPixel(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('<img src=');
    expect(result).toMatch(/" \/>$/);
  });

  it('should encode special characters in IDs', () => {
    const result = injectTrackingPixel(
      '<body></body>',
      'camp&1',
      'contact 2',
      baseUrl,
    );
    expect(result).toContain('cid=camp%261');
    expect(result).toContain('rid=contact%202');
  });
});

describe('rewriteLinksForTracking', () => {
  const baseUrl = 'https://track.example.com';

  it('should rewrite http links', () => {
    const html = '<a href="https://example.com/page">Click</a>';
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain(
      'href="https://track.example.com/track/click?cid=camp1&rid=contact1&url=https%3A%2F%2Fexample.com%2Fpage"',
    );
  });

  it('should not rewrite mailto links', () => {
    const html = '<a href="mailto:test@example.com">Email</a>';
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('href="mailto:test@example.com"');
  });

  it('should not rewrite tel links', () => {
    const html = '<a href="tel:+1234567890">Call</a>';
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('href="tel:+1234567890"');
  });

  it('should not rewrite anchor links', () => {
    const html = '<a href="#section">Jump</a>';
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('href="#section"');
  });

  it('should not rewrite already-tracked URLs', () => {
    const html = `<a href="${baseUrl}/already-tracked">Link</a>`;
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain(`href="${baseUrl}/already-tracked"`);
  });

  it('should rewrite multiple links', () => {
    const html = '<a href="https://a.com">A</a><a href="https://b.com">B</a>';
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('url=https%3A%2F%2Fa.com');
    expect(result).toContain('url=https%3A%2F%2Fb.com');
  });

  it('should preserve link attributes', () => {
    const html = '<a href="https://example.com" class="btn" target="_blank">Click</a>';
    const result = rewriteLinksForTracking(html, 'camp1', 'contact1', baseUrl);
    expect(result).toContain('class="btn"');
    expect(result).toContain('target="_blank"');
  });
});
