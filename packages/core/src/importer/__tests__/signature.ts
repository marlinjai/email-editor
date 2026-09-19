// A structural signature of compiled HTML, for "equivalent HTML" in the round-trip tests:
// what a reader sees and what a mail client loads, in order, ignoring markup
// that only differs in shape (wrapper elements, class names, whitespace, comments).

import { Parser } from 'htmlparser2';

export interface Signature {
  /** Visible text runs, whitespace collapsed, in document order. */
  text: string[];
  /** Every link target, in order. */
  links: string[];
  /** Every image, `src | alt`, in order. */
  images: string[];
  /** Every background colour set on an element, sorted (order differs with wrapper depth). */
  backgrounds: string[];
}

export function signature(html: string): Signature {
  const sig: Signature = { text: [], links: [], images: [], backgrounds: [] };
  let skip = 0;
  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'style' || name === 'script' || name === 'head') skip += 1;
        if (name === 'a' && attrs.href) sig.links.push(attrs.href);
        if (name === 'img') sig.images.push(`${attrs.src ?? ''} | ${attrs.alt ?? ''}`);
        const style = attrs.style ?? '';
        for (const m of style.matchAll(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|transparent|rgba?\([^)]*\))/g)) {
          sig.backgrounds.push(m[1]!.toLowerCase());
        }
      },
      ontext(text) {
        if (skip > 0) return;
        const t = text.replace(/\s+/g, ' ').trim();
        if (t) sig.text.push(t);
      },
      onclosetag(name) {
        if (name === 'style' || name === 'script' || name === 'head') skip -= 1;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  // Adjacent text runs split differently by wrapper elements: compare the joined text as one run too.
  sig.text = [sig.text.join(' ')];
  sig.backgrounds.sort();
  return sig;
}
