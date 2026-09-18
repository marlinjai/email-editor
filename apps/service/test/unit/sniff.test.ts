import { describe, expect, it } from 'vitest';
import { sniffImage } from '../../src/assets/sniff.js';
import { cleanFilename } from '../../src/routes/assets.js';
import { gifBytes, jpegBytes, pngBytes, webpBytes } from '../support/images.js';

describe('sniffImage', () => {
  it('recognises PNG with its size', () => {
    expect(sniffImage(pngBytes(640, 480))).toEqual({ contentType: 'image/png', width: 640, height: 480 });
  });

  it('recognises JPEG, reading the size from the start-of-frame segment', () => {
    expect(sniffImage(jpegBytes(300, 200))).toEqual({ contentType: 'image/jpeg', width: 300, height: 200 });
  });

  it('recognises GIF87a and GIF89a', () => {
    expect(sniffImage(gifBytes(16, 9))).toEqual({ contentType: 'image/gif', width: 16, height: 9 });
    const old = gifBytes(1, 1);
    old.write('GIF87a', 0, 'latin1');
    expect(sniffImage(old)?.contentType).toBe('image/gif');
  });

  it('recognises WebP (VP8X, VP8L and VP8)', () => {
    expect(sniffImage(webpBytes('VP8X', 1200, 630))).toEqual({ contentType: 'image/webp', width: 1200, height: 630 });
    expect(sniffImage(webpBytes('VP8L', 50, 40))).toEqual({ contentType: 'image/webp', width: 50, height: 40 });
    expect(sniffImage(webpBytes('VP8 ', 320, 240))).toEqual({ contentType: 'image/webp', width: 320, height: 240 });
  });

  it('refuses everything else, whatever it claims to be', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.7\n'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF8'))).toBeNull();
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WAVEfmt '))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });

  it('keeps the type but not a size it cannot read from a truncated header', () => {
    expect(sniffImage(pngBytes(10, 10).subarray(0, 12))).toEqual({ contentType: 'image/png', width: null, height: null });
  });
});

describe('cleanFilename', () => {
  it('keeps the last path segment and puts the sniffed extension on it', () => {
    expect(cleanFilename('C:\\Users\\me\\hero.JPG', 'image/png')).toBe('hero.png');
    expect(cleanFilename('../../etc/hosts', 'image/gif')).toBe('hosts.gif');
  });

  it('strips control characters and falls back to "image"', () => {
    expect(cleanFilename('bad\u0000name\n.png', 'image/png')).toBe('badname.png');
    expect(cleanFilename('', 'image/webp')).toBe('image.webp');
    expect(cleanFilename(undefined, 'image/jpeg')).toBe('image.jpg');
  });

  it('caps the length', () => {
    expect(cleanFilename(`${'a'.repeat(400)}.png`, 'image/png').length).toBeLessThanOrEqual(255);
  });
});
