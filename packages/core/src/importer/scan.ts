// packages/core/src/importer/scan.ts
// A strict well-formedness pass over MJML source, before the (lenient) MJML parser sees it

import { MAX_MJML_BYTES, MAX_MJML_DEPTH, MAX_MJML_ELEMENTS, MjmlImportError } from './types';

/**
 * mjml-parser-xml is built on a forgiving HTML parser: an unclosed
 * `<mj-section>` is closed for you, a stray `</mj-column>` is ignored, and it
 * reads `mj-include` files from the server's disk. So every source goes
 * through this scan first, which refuses, with a line and a column:
 *
 * - anything larger than {@link MAX_MJML_BYTES};
 * - a first element other than `<mjml>`, or markup after it closes;
 * - an unclosed, mismatched or stray tag, a malformed or duplicated attribute;
 * - `mj-include`, anywhere outside content;
 * - nesting deeper than {@link MAX_MJML_DEPTH}, more than {@link MAX_MJML_ELEMENTS} elements.
 *
 * The content of an ending tag (`mj-text`, `mj-button`, `mj-raw`, ...) is
 * HTML, which email authors write loosely: it is opaque here, as it is to MJML,
 * and only its closing tag is looked for.
 */

type Position = { line: number; column: number };

function locator(source: string): (index: number) => Position {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: index - starts[lo]! + 1 };
  };
}

const NAME = /[A-Za-z_][A-Za-z0-9_.:-]*/y;
const ATTRIBUTE = /\s+([^\s=/>"'<]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
const TAG_END = /\s*(\/?)>/y;

type OpenTag = { name: string; index: number };

export function scanMjml(source: string, endingTags: ReadonlySet<string>): void {
  if (Buffer.byteLength(source, 'utf8') > MAX_MJML_BYTES) {
    throw new MjmlImportError('too_large', `The MJML is larger than ${MAX_MJML_BYTES} bytes.`);
  }
  const at = locator(source);
  const fail = (code: 'invalid_xml' | 'not_mjml' | 'include_not_supported' | 'too_deep' | 'too_many_elements', message: string, index: number): never => {
    throw new MjmlImportError(code, message, at(index));
  };

  const stack: OpenTag[] = [];
  let elements = 0;
  let rootClosed = false;
  let rootSeen = false;
  let i = 0;

  const skipPast = (terminator: string, from: number, what: string): number => {
    const end = source.indexOf(terminator, from);
    if (end < 0) fail('invalid_xml', `${what} is never closed.`, from);
    return end + terminator.length;
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    const textEnd = lt < 0 ? source.length : lt;
    if (source.slice(i, textEnd).trim() !== '' && (stack.length === 0 || rootClosed)) {
      fail(rootSeen ? 'invalid_xml' : 'not_mjml', rootSeen ? 'Text after the closing </mjml>.' : 'The document must start with <mjml>.', i + source.slice(i, textEnd).search(/\S/));
    }
    if (lt < 0) break;
    i = lt;

    if (source.startsWith('<!--', i)) {
      i = skipPast('-->', i + 4, 'A comment');
      continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      i = skipPast(']]>', i + 9, 'A CDATA section');
      continue;
    }
    if (source.startsWith('<?', i)) {
      if (rootSeen) fail('invalid_xml', 'A processing instruction inside the document.', i);
      i = skipPast('?>', i + 2, 'A processing instruction');
      continue;
    }
    if (source.startsWith('<!', i)) {
      if (rootSeen) fail('invalid_xml', 'A declaration inside the document.', i);
      i = skipPast('>', i + 2, 'A declaration');
      continue;
    }

    const closing = source[i + 1] === '/';
    NAME.lastIndex = i + (closing ? 2 : 1);
    const nameMatch = NAME.exec(source);
    if (!nameMatch) fail('invalid_xml', 'A "<" that does not start a tag. Write it as &lt; outside content.', i);
    const name = nameMatch![0];
    let cursor = NAME.lastIndex;

    if (closing) {
      TAG_END.lastIndex = cursor;
      const end = TAG_END.exec(source);
      if (!end || end[1] === '/') fail('invalid_xml', `The closing tag </${name}> is malformed.`, i);
      const open = stack.pop();
      if (!open) fail('invalid_xml', `</${name}> closes nothing.`, i);
      if (open!.name !== name) {
        const where = at(open!.index);
        fail('invalid_xml', `</${name}> does not match <${open!.name}> opened on line ${where.line}, column ${where.column}.`, i);
      }
      if (stack.length === 0) rootClosed = true;
      i = TAG_END.lastIndex;
      continue;
    }

    // An opening tag.
    if (rootClosed) fail('invalid_xml', `<${name}> after the closing </mjml>.`, i);
    if (!rootSeen) {
      if (name !== 'mjml') fail('not_mjml', `The document must start with <mjml>, not <${name}>.`, i);
      rootSeen = true;
    }
    if (name === 'mj-include') {
      fail('include_not_supported', 'mj-include is not supported: an import has no files to include. Paste the included MJML in its place.', i);
    }
    const seen = new Set<string>();
    for (;;) {
      ATTRIBUTE.lastIndex = cursor;
      const attr = ATTRIBUTE.exec(source);
      if (!attr) break;
      if (seen.has(attr[1]!)) fail('invalid_xml', `The attribute "${attr[1]}" appears twice on <${name}>.`, cursor);
      seen.add(attr[1]!);
      cursor = ATTRIBUTE.lastIndex;
    }
    TAG_END.lastIndex = cursor;
    const end = TAG_END.exec(source);
    if (!end) fail('invalid_xml', `The tag <${name}> is malformed (an unquoted or unclosed attribute value?).`, cursor);
    i = TAG_END.lastIndex;
    elements += 1;
    if (elements > MAX_MJML_ELEMENTS) fail('too_many_elements', `More than ${MAX_MJML_ELEMENTS} MJML elements.`, i);
    if (end![1] === '/') {
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    if (stack.length + 1 > MAX_MJML_DEPTH) fail('too_deep', `MJML elements are nested more than ${MAX_MJML_DEPTH} deep.`, i);

    if (endingTags.has(name)) {
      // Opaque content: find the closing tag, counting nested ones of the same name.
      let depth = 1;
      const token = new RegExp(`<!--|<(/?)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])`, 'g');
      token.lastIndex = i;
      let m: RegExpExecArray | null;
      while ((m = token.exec(source))) {
        if (m[0] === '<!--') {
          const close = source.indexOf('-->', m.index + 4);
          if (close < 0) fail('invalid_xml', 'A comment is never closed.', m.index);
          token.lastIndex = close + 3;
          continue;
        }
        const gt = source.indexOf('>', m.index);
        if (gt < 0) fail('invalid_xml', `The tag at this position is never closed.`, m.index);
        if (m[1] === '/') depth -= 1;
        else if (source[gt - 1] !== '/') depth += 1;
        token.lastIndex = gt + 1;
        if (depth === 0) break;
      }
      if (depth !== 0) fail('invalid_xml', `<${name}> is never closed.`, i);
      i = token.lastIndex;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    stack.push({ name, index: lt });
  }

  if (!rootSeen) fail('not_mjml', 'The document is empty: it must start with <mjml>.', 0);
  const open = stack.pop();
  if (open) fail('invalid_xml', `<${open.name}> is never closed.`, open.index);
}
