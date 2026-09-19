// packages/core/src/importer/tree.ts
// MJML source to a node tree (mjml-parser-xml), and a node back to MJML

import parseXmlModule from 'mjml-parser-xml';
import presetModule from 'mjml-preset-core';

/** One element of the parsed tree. `content` is the verbatim inner markup of an ending tag. */
export interface MjmlNode {
  tagName: string;
  attributes: Record<string, string>;
  content?: string;
  children: MjmlNode[];
  line?: number;
}

type Component = { getTagName?: () => string; componentName?: string; endingTag?: boolean };
type ParseFn = (xml: string, options: Record<string, unknown>) => RawNode;
type RawNode = { tagName: string; attributes?: Record<string, unknown>; content?: string; children?: RawNode[]; line?: number };

// Both packages are CommonJS with `exports.default`; under Node's ESM loader
// the default import is the whole `module.exports`, so unwrap either shape.
function unwrap<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  return (m && typeof m === 'object' && 'default' in m && m.default ? m.default : mod) as T;
}

const parseXml = unwrap<ParseFn>(parseXmlModule);
const preset = unwrap<{ components: Component[] }>(presetModule);

const componentName = (c: Component) => (c.getTagName ? c.getTagName() : (c.componentName ?? ''));

/** The standard MJML components by tag name, as mjml-parser-xml wants them. */
export const COMPONENTS: Record<string, Component> = Object.fromEntries(preset.components.map((c) => [componentName(c), c]));

/** Tags whose content is opaque HTML (mj-text, mj-button, mj-raw, mj-style, ...). */
export const ENDING_TAGS: ReadonlySet<string> = new Set(
  preset.components.filter((c) => c.endingTag).map((c) => componentName(c)),
);

/** Every tag MJML itself knows. Anything else is an unknown (custom) component. */
export const KNOWN_TAGS: ReadonlySet<string> = new Set(['mjml', ...Object.keys(COMPONENTS), 'mj-all', 'mj-class', 'mj-selector', 'mj-html-attribute']);

function normalize(node: RawNode): MjmlNode {
  const attributes: Record<string, string> = {};
  // Values stay XML-escaped as written; a literal quote (legal inside a
  // single-quoted attribute) is escaped too, since the compiler writes every
  // value inside double quotes.
  for (const [k, v] of Object.entries(node.attributes ?? {})) attributes[k] = String(v).replace(/"/g, '&quot;');
  return {
    tagName: node.tagName,
    attributes,
    content: node.content,
    children: (node.children ?? []).map(normalize),
    line: node.line,
  };
}

/**
 * Parses source that already passed {@link scanMjml}. Includes are never
 * followed (the scan refuses them; `ignoreIncludes` is the second lock), and
 * values stay exactly as written: no entity decoding, no boolean conversion.
 */
export function parseMjml(source: string): MjmlNode {
  const root = parseXml(source, {
    components: COMPONENTS,
    keepComments: true,
    ignoreIncludes: true,
    convertBooleans: false,
    addEmptyAttributes: true,
  });
  return normalize(root);
}

/** A node back to MJML markup, attributes in source order. */
export function serialize(node: MjmlNode): string {
  const attrs = Object.entries(node.attributes)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const inner = node.content !== undefined ? node.content : node.children.map(serialize).join('');
  if (inner === '' && node.children.length === 0 && node.content === undefined) return `<${node.tagName}${attrs} />`;
  return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
}

/** Whether a node is an HTML comment (the parser turns comments into `mj-raw` nodes). */
export function isComment(node: MjmlNode): boolean {
  return node.tagName === 'mj-raw' && Object.keys(node.attributes).length === 0 && node.children.length === 0 && /^<!--[\s\S]*-->$/.test(node.content ?? '');
}
