import type { AssetContentType } from '@marlinjai/mail-contract';

/**
 * What an uploaded file really is, read from its bytes. The extension and the
 * Content-Type the uploader sent are never trusted: a file is an image here only
 * if it starts with the signature of one of the four formats mail clients
 * render (PNG, JPEG, GIF, WebP). SVG is deliberately absent, since it can carry
 * script.
 *
 * Width and height are read from the header when the format puts them there;
 * null when the header is too short or unusual to be sure.
 */
export type SniffedImage = { contentType: AssetContentType; width: number | null; height: number | null };

function positive(n: number): number | null {
  return Number.isInteger(n) && n > 0 ? n : null;
}

function png(b: Buffer): SniffedImage | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 8 || !sig.every((v, i) => b[i] === v)) return null;
  // The first chunk is IHDR: length(4) type(4) width(4) height(4).
  const ihdr = b.length >= 24 && b.toString('latin1', 12, 16) === 'IHDR';
  return {
    contentType: 'image/png',
    width: ihdr ? positive(b.readUInt32BE(16)) : null,
    height: ihdr ? positive(b.readUInt32BE(20)) : null,
  };
}

function gif(b: Buffer): SniffedImage | null {
  if (b.length < 6) return null;
  const head = b.toString('latin1', 0, 6);
  if (head !== 'GIF87a' && head !== 'GIF89a') return null;
  const dims = b.length >= 10;
  return {
    contentType: 'image/gif',
    width: dims ? positive(b.readUInt16LE(6)) : null,
    height: dims ? positive(b.readUInt16LE(8)) : null,
  };
}

function webp(b: Buffer): SniffedImage | null {
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
  let width: number | null = null;
  let height: number | null = null;
  const chunk = b.length >= 16 ? b.toString('latin1', 12, 16) : '';
  if (chunk === 'VP8X' && b.length >= 30) {
    width = positive(1 + b.readUIntLE(24, 3));
    height = positive(1 + b.readUIntLE(27, 3));
  } else if (chunk === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    width = positive(b.readUInt16LE(26) & 0x3fff);
    height = positive(b.readUInt16LE(28) & 0x3fff);
  } else if (chunk === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
    const bits = b.readUInt32LE(21);
    width = positive((bits & 0x3fff) + 1);
    height = positive(((bits >> 14) & 0x3fff) + 1);
  }
  return { contentType: 'image/webp', width, height };
}

function jpeg(b: Buffer): SniffedImage | null {
  if (b.length < 3 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  // Walk the segments to the first start-of-frame marker, which holds the size.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    const length = b.readUInt16BE(i + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { contentType: 'image/jpeg', width: positive(b.readUInt16BE(i + 7)), height: positive(b.readUInt16BE(i + 5)) };
    }
    if (length < 2) break;
    i += 2 + length;
  }
  return { contentType: 'image/jpeg', width: null, height: null };
}

export function sniffImage(bytes: Buffer): SniffedImage | null {
  return png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes);
}
