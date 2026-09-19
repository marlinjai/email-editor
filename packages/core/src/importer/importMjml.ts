// packages/core/src/importer/importMjml.ts
// MJML source to an editor document. SERVER-SIDE ONLY (it compiles fallbacks with mjml).

import mjml2html from 'mjml';
import { nanoid } from 'nanoid';
import { DEFAULT_MJML_ATTRIBUTES } from '../compiler/MJMLCompiler';
import { migrateTemplate, isTemplateMigrationError } from '../schema/migrate';
import type { BackgroundGradient } from '../schema/gradient';
import type {
  AccordionBlock,
  Block,
  ButtonBlock,
  CarouselBlock,
  Column,
  DividerBlock,
  EmailTemplate,
  ExtraAttributes,
  FontDefinition,
  HeroBlock,
  ImageBlock,
  MjmlHead,
  NavbarBlock,
  RawBlock,
  Section,
  SocialBlock,
  SocialLink,
  Spacing,
  SubColumn,
  TableBlock,
  TemplateMetadata,
  TextBlock,
} from '../schema/types';
import { scanMjml } from './scan';
import { ENDING_TAGS, KNOWN_TAGS, isComment, parseMjml, serialize, type MjmlNode } from './tree';
import {
  MjmlImportError,
  type MjmlImportResult,
  type MjmlImportWarning,
  type MjmlImportWarningCode,
} from './types';

/*
 * How the import maps MJML onto the editor's document, in one place:
 *
 * - Every element's own attributes that match a field of the matching block
 *   become that field; every other attribute is kept in `extraAttributes` and
 *   emitted again by the compiler. Attributes are never resolved against
 *   `mj-attributes` or `mj-class`: those stay in the document
 *   (`metadata.mjmlHead`, and `mj-class` as a kept attribute), so MJML resolves
 *   them at compile time exactly as it did for the source.
 * - The editor's own export is recognised (`css-class="el-<type> el-<id>"`,
 *   and the `data-ee-*` markers on its raw markup), so exporting a template and
 *   importing it again gives back the same blocks with the same ids.
 * - What the editor cannot hold as a block (an `mj-wrapper` around several
 *   sections, an `mj-hero` with content, `mj-social`, a hand-written
 *   `mj-table`, an unknown component, ...) is compiled with the whole source,
 *   in place, and kept as a Raw HTML block holding exactly that output, so the
 *   compiled mail does not change. Each such case is a warning with the MJML
 *   it came from.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/;
const FRAGMENT_LIMIT = 2000;

const EDITOR_SUB_COLUMN_STYLE = `@media only screen and (max-width:480px) {
  table.ee-sub-cols td.ee-sub-col {
    display: block !important;
    width: 100% !important;
    padding-bottom: 12px !important;
  }
  table.ee-sub-cols td.ee-sub-col:last-child {
    padding-bottom: 0 !important;
  }
}`;
const EDITOR_COMMENTS = new Set(['<!-- Social Icons (horizontal) -->', '<!-- Social Icons (vertical) -->']);
const SOCIAL_PLATFORMS = new Set(['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'pinterest', 'github']);
const SOCIAL_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  twitter: '#000000',
  instagram: '#E4405F',
  linkedin: '#0A66C2',
  youtube: '#FF0000',
  pinterest: '#BD081C',
  github: '#181717',
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const shorten = (s: string) => (s.length > FRAGMENT_LIMIT ? `${s.slice(0, FRAGMENT_LIMIT)}...` : s);

function decodeEditorData<T>(value: string | undefined): T | null {
  if (!value || !/^[A-Za-z0-9+/=]+$/.test(value)) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** A CSS padding shorthand as a spacing object; null when it is not one to four plain values. */
function parsePadding(value: string): Spacing | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4 || parts.some((p) => !/^-?[0-9.]+(px|%|em|rem)?$/.test(p))) return null;
  const [top, right = top, bottom = top, left = right] = parts as [string, string?, string?, string?];
  const all: Spacing = { top, right, bottom, left };
  // The compiler writes an unset side as a bare 0, so those are left unset (as
  // the editor stores them); any other value, 0px included, is kept as written.
  const out: Spacing = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) if (all[side] !== '0') out[side] = all[side];
  // "0 0 0 0" must stay: without a padding the element would get MJML's default one.
  if (Object.keys(out).length === 0) return { top: '0', right: '0', bottom: '0', left: '0' };
  return out;
}

/** The editor's gradient rule, `.el-grad-<id> { background-image: <gradient>; }`, read back. */
function parseGradientRules(css: string): Map<string, BackgroundGradient> | null {
  const rules = css.trim().split('\n').filter((l) => l.trim() !== '');
  const out = new Map<string, BackgroundGradient>();
  for (const rule of rules) {
    const m = /^\.el-grad-([A-Za-z0-9_-]+) \{ background-image: (linear|radial)-gradient\((?:(-?[0-9.]+)deg|circle), (.*)\); \}$/.exec(rule.trim());
    if (!m) return null;
    const stops = m[4]!.split(/,\s(?![^()]*\))/).map((s) => {
      const sm = /^(.*) (-?[0-9.]+)%$/.exec(s.trim());
      return sm ? { color: sm[1]!, position: Number(sm[2]) } : null;
    });
    if (stops.some((s) => s === null)) return null;
    out.set(m[1]!, { type: m[2] as 'linear' | 'radial', angle: m[3] ? Number(m[3]) : 0, stops: stops as BackgroundGradient['stops'] });
  }
  return out;
}

type Fallback = { node: MjmlNode; parent: MjmlNode; block: RawBlock; unknown: boolean };

class Importer {
  readonly warnings: MjmlImportWarning[] = [];
  private readonly usedIds = new Set<string>();
  private readonly fallbacks: Fallback[] = [];
  private gradients = new Map<string, BackgroundGradient>();
  private readonly kept = new Map<string, number>();
  private usesMjClass = false;
  private hasOwnDefaults = false;

  constructor(private readonly root: MjmlNode) {}

  warn(code: MjmlImportWarningCode, severity: 'info' | 'warning', path: string, node: MjmlNode | undefined, message: string, withFragment = false) {
    this.warnings.push({
      severity,
      code,
      path,
      line: node?.line,
      message,
      ...(withFragment && node ? { fragment: shorten(serialize(node)) } : {}),
    });
  }

  id(candidate?: string): string {
    if (candidate && ID.test(candidate) && !this.usedIds.has(candidate)) {
      this.usedIds.add(candidate);
      return candidate;
    }
    let fresh = nanoid();
    while (this.usedIds.has(fresh)) fresh = nanoid();
    this.usedIds.add(fresh);
    return fresh;
  }

  /** `css-class="el-<type> el-<id> ..."`: the editor's id, and the author's own classes. */
  identity(attrs: Record<string, string>, marker: string): { id?: string; classes: string[] } {
    const classes = (attrs['css-class'] ?? '').split(/\s+/).filter(Boolean);
    delete attrs['css-class'];
    if (classes[0] === marker && classes[1]?.startsWith('el-')) {
      const id = classes[1].slice(3);
      return { id, classes: classes.slice(2).filter((c) => c !== `el-grad-${id}`) };
    }
    return { classes };
  }

  /** Whatever is left of `attrs` (plus the author's classes), as kept attributes. */
  extras(attrs: Record<string, string>, classes: string[], path: string, node: MjmlNode): ExtraAttributes | undefined {
    const out: ExtraAttributes = {};
    for (const [name, value] of Object.entries(attrs)) {
      if (!ATTRIBUTE_NAME.test(name)) {
        this.warn('attribute_dropped', 'info', path, node, `The attribute "${name}" is not an MJML attribute name; MJML ignored it and so does the editor.`);
        continue;
      }
      if (name === 'mj-class') this.usesMjClass = true;
      out[name] = value;
      this.kept.set(name, (this.kept.get(name) ?? 0) + 1);
    }
    if (classes.length > 0) {
      out['css-class'] = classes.join(' ');
      this.kept.set('css-class', (this.kept.get('css-class') ?? 0) + 1);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  /** Marks `node` (a child of `parent`) to be kept as compiled HTML. */
  fallback(node: MjmlNode, parent: MjmlNode, path: string, reason: string, unknown = false): RawBlock {
    const block: RawBlock = { id: this.id(), type: 'raw', html: '' };
    this.fallbacks.push({ node, parent, block, unknown });
    if (unknown) {
      this.warn('unknown_component', 'warning', path, node, `<${node.tagName}> is not an MJML component, so MJML renders nothing for it. Its source is kept, as a comment, in a Raw block.`, true);
    } else {
      this.warn('kept_as_html', 'warning', path, node, `${reason} It is kept as compiled HTML in a Raw block: the mail looks the same, but it is not editable as a block. Rebuild it in the editor to edit it.`, true);
    }
    return block;
  }

  // Head

  head(head: MjmlNode | undefined, body: MjmlNode): TemplateMetadata {
    const metadata: TemplateMetadata = {};
    const mjmlHead: MjmlHead = {};
    const fonts: FontDefinition[] = [];
    const css: string[] = [];
    const inline: string[] = [];
    const raw: string[] = [];
    let attributes: string | undefined;

    for (const [index, node] of (head?.children ?? []).entries()) {
      const path = `mj-head > ${node.tagName}[${index + 1}]`;
      const a = node.attributes;
      switch (node.tagName) {
        case 'mj-title':
          metadata.title = node.content ?? '';
          break;
        case 'mj-preview':
          metadata.previewText = node.content ?? '';
          break;
        case 'mj-font':
          if (a.name && a.href && Object.keys(a).length === 2) fonts.push({ name: a.name, href: a.href });
          else raw.push(serialize(node));
          break;
        case 'mj-breakpoint':
          if (a.width && Object.keys(a).length === 1) metadata.breakpoint = a.width;
          else raw.push(serialize(node));
          break;
        case 'mj-style': {
          const content = node.content ?? '';
          const keys = Object.keys(a);
          if (keys.length === 1 && a.inline === 'inline') inline.push(content);
          else if (keys.length > 0) {
            raw.push(serialize(node));
            this.warn('head_element_kept', 'info', path, node, 'An mj-style with attributes the editor has no field for is kept as it is.');
          } else if (squash(content) === squash(EDITOR_SUB_COLUMN_STYLE)) {
            // The editor's own sub-column media query: the compiler adds it again.
          } else {
            const gradients = parseGradientRules(content);
            if (gradients && gradients.size > 0) for (const [id, g] of gradients) this.gradients.set(id, g);
            else css.push(content);
          }
          break;
        }
        case 'mj-attributes': {
          const markup = node.children.map(serialize).join('');
          attributes = (attributes ?? '') + markup;
          break;
        }
        default:
          raw.push(serialize(node));
          if (isComment(node)) break;
          if (!KNOWN_TAGS.has(node.tagName)) {
            this.warn('unknown_component', 'warning', path, node, `<${node.tagName}> is not an MJML head element; it is kept as it is, and MJML ignores it.`, true);
          } else {
            this.warn('head_element_kept', 'info', path, node, `<${node.tagName}> has no field in the editor; it is kept as it is and applies to the mail.`);
          }
      }
    }

    if (fonts.length > 0) metadata.fonts = fonts;
    if (css.length > 0) metadata.customCSS = css.join('\n');
    if (inline.length > 0) metadata.inlineCSS = inline.join('\n');
    // The editor's own defaults need no copy; anything else (including none at all) is kept.
    const isEditorDefault = attributes !== undefined && squash(attributes) === squash(DEFAULT_MJML_ATTRIBUTES.replace(/\s*\n\s*/g, ''));
    if (!isEditorDefault) {
      mjmlHead.attributes = attributes ?? '';
      if ((attributes ?? '').trim() !== '') this.hasOwnDefaults = true;
    }
    if (raw.length > 0) mjmlHead.headRaw = raw.join('\n');
    const bodyAttrs = { ...body.attributes };
    const bodyExtra = this.extras(bodyAttrs, [], 'mj-body', body);
    if (bodyExtra) mjmlHead.bodyAttributes = bodyExtra;
    if (Object.keys(mjmlHead).length > 0) metadata.mjmlHead = mjmlHead;
    return metadata;
  }

  // Body

  body(body: MjmlNode): Section[] {
    const sections: Section[] = [];
    let rawRun: RawBlock[] | null = null;
    const pushRaw = (block: RawBlock) => {
      if (!rawRun) {
        rawRun = [];
        sections.push({ id: this.id(), type: 'section', bodyRaw: true, columns: [{ id: this.id(), width: 100, blocks: rawRun }] });
      }
      rawRun.push(block);
    };
    const counts = new Map<string, number>();

    for (const node of body.children) {
      const n = (counts.get(node.tagName) ?? 0) + 1;
      counts.set(node.tagName, n);
      const path = `mj-body > ${node.tagName}[${n}]`;

      if (node.tagName === 'mj-raw') {
        if (isComment(node) && EDITOR_COMMENTS.has(node.content!.trim())) continue;
        const attrs = { ...node.attributes };
        const { id, classes } = this.identity(attrs, 'el-raw');
        if (Object.keys(attrs).length > 0 || classes.length > 0) {
          pushRaw(this.fallback(node, body, path, 'This mj-raw has attributes (such as position) the editor cannot keep.'));
        } else {
          pushRaw({ id: this.id(id), type: 'raw', html: node.content ?? '' });
        }
        continue;
      }
      if (node.tagName === 'mj-section' || node.tagName === 'mj-wrapper') {
        const section = node.tagName === 'mj-section' ? this.section(node, undefined, path) : this.wrapper(node, path);
        if (section) {
          rawRun = null;
          sections.push(section);
        } else {
          const why =
            node.tagName === 'mj-wrapper'
              ? 'The editor holds a wrapper around exactly one plain section; this one holds more, or its sections carry attributes.'
              : 'The editor cannot hold this section as it is (see the other warnings for it).';
          pushRaw(this.fallback(node, body, path, why));
        }
        continue;
      }
      if (node.tagName === 'mj-hero') {
        pushRaw(this.fallback(node, body, path, "The editor's Hero block has no content of its own, so an mj-hero with text and buttons cannot become one."));
        continue;
      }
      if (!KNOWN_TAGS.has(node.tagName)) {
        pushRaw(this.fallback(node, body, path, '', true));
        continue;
      }
      pushRaw(this.fallback(node, body, path, `<${node.tagName}> does not belong directly in mj-body; MJML renders it as it can.`));
    }
    if (typeof body.content === 'string' && body.content.trim()) {
      this.warn('stray_text', 'info', 'mj-body', body, 'Text directly in mj-body is ignored by MJML, and by the import.');
    }
    return sections;
  }

  wrapper(node: MjmlNode, path: string): Section | null {
    const inner = node.children.filter((c) => !isComment(c));
    if (inner.length !== 1 || inner[0]!.tagName !== 'mj-section' || Object.keys(inner[0]!.attributes).length > 0) return null;
    if (node.children.some((c) => isComment(c) && /^<!--\[if/.test(c.content ?? ''))) return null;
    return this.section(inner[0]!, node, path);
  }

  section(node: MjmlNode, wrapper: MjmlNode | undefined, path: string): Section | null {
    const outer = wrapper ?? node;
    const attrs = { ...outer.attributes };
    const { id, classes } = this.identity(attrs, wrapper ? 'el-wrapper' : 'el-section');
    const sectionId = this.id(id);
    const section: Section = { id: sectionId, type: 'section', columns: [] };
    if (wrapper) section.isWrapper = true;

    const gradient = id ? this.gradients.get(id) : undefined;
    if (gradient) {
      section.backgroundGradient = gradient;
      delete attrs['background-color'];
    }
    this.mapCommon(attrs, section, {
      'background-color': 'backgroundColor',
      'background-url': 'backgroundImage',
      'background-position': 'backgroundPosition',
      'background-size': 'backgroundSize',
    });
    if (attrs['background-repeat'] === 'repeat' || attrs['background-repeat'] === 'no-repeat') {
      section.backgroundRepeat = attrs['background-repeat'];
      delete attrs['background-repeat'];
    }
    if (attrs['full-width'] === 'full-width') {
      section.fullWidth = true;
      delete attrs['full-width'];
    }
    this.mapPadding(attrs, section);

    // Children: columns, or exactly one plain mj-group of columns.
    const children: MjmlNode[] = [];
    for (const child of node.children) {
      if (isComment(child)) {
        if (/^<!--\[if/.test(child.content ?? '')) return null;
        this.warn('comment_dropped', 'info', `${path} > comment`, child, 'A comment between columns is left out: it renders nothing.');
        continue;
      }
      children.push(child);
    }
    let columnNodes = children;
    let parent = node;
    if (children.length === 1 && children[0]!.tagName === 'mj-group') {
      const group = children[0]!;
      if (Object.keys(group.attributes).length > 0 || wrapper) return null;
      columnNodes = group.children.filter((c) => {
        if (!isComment(c)) return true;
        if (/^<!--\[if/.test(c.content ?? '')) columnNodes = [];
        return false;
      });
      parent = group;
      if (columnNodes.length > 1) section.noStack = true;
    }
    if (columnNodes.length === 0 || columnNodes.some((c) => c.tagName !== 'mj-column')) return null;

    const counts = new Map<string, number>();
    for (const [index, col] of columnNodes.entries()) {
      const n = (counts.get(col.tagName) ?? 0) + 1;
      counts.set(col.tagName, n);
      section.columns.push(this.column(col, columnNodes.length, `${path}${parent !== node ? ' > mj-group[1]' : ''} > mj-column[${index + 1}]`));
    }
    const extra = this.extras(attrs, classes, path, outer);
    if (extra) section.extraAttributes = extra;
    return section;
  }

  column(node: MjmlNode, siblings: number, path: string): Column {
    const attrs = { ...node.attributes };
    const { id, classes } = this.identity(attrs, 'el-column');
    const column: Column = { id: this.id(id), blocks: [] };
    const gradient = id ? this.gradients.get(id) : undefined;
    if (gradient) {
      column.backgroundGradient = gradient;
      delete attrs['background-color'];
    }
    const width = attrs.width;
    if (width === undefined) {
      // MJML shares the section evenly; say so explicitly, since the editor's
      // store would otherwise open the column at 100%. The editor's own export
      // leaves a width out only where its document had none: keep it that way.
      if (!id) column.width = 100 / siblings;
    } else if (/^[0-9]+(\.[0-9]+)?%$/.test(width) && Number.parseFloat(width) <= 100) {
      column.width = Number.parseFloat(width);
      delete attrs.width;
    } else {
      this.warn('column_width_px', 'info', path, node, `The column width "${width}" is kept as it is; the editor's width control works in percent.`);
    }
    this.mapCommon(attrs, column, { 'background-color': 'backgroundColor' });
    if (attrs['vertical-align'] === 'top' || attrs['vertical-align'] === 'middle' || attrs['vertical-align'] === 'bottom') {
      column.verticalAlign = attrs['vertical-align'];
      delete attrs['vertical-align'];
    }
    this.mapPadding(attrs, column);

    // The editor's sub-columns: one marked raw table.
    const only = node.children.length === 1 ? node.children[0]! : undefined;
    if (only?.tagName === 'mj-raw') {
      const m = /^\s*<table role="presentation" class="ee-sub-cols" data-ee-subcols="([A-Za-z0-9+/=]+)"/.exec(only.content ?? '');
      const subs = decodeEditorData<SubColumn[]>(m?.[1]);
      if (subs && Array.isArray(subs) && subs.length > 0) {
        column.subColumns = subs;
        for (const s of subs) this.id(s.id);
        const extra = this.extras(attrs, classes, path, node);
        if (extra) column.extraAttributes = extra;
        return column;
      }
    }

    const counts = new Map<string, number>();
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const n = (counts.get(child.tagName) ?? 0) + 1;
      counts.set(child.tagName, n);
      const childPath = `${path} > ${child.tagName}[${n}]`;
      if (isComment(child) && EDITOR_COMMENTS.has(child.content!.trim())) continue;

      // The editor's vertical social block: a run of marked buttons with one id.
      const social = this.socialButtons(children, i);
      if (social) {
        column.blocks.push(social.block);
        i = social.end - 1;
        continue;
      }
      const block = this.block(child, childPath);
      column.blocks.push(block ?? this.fallback(child, node, childPath, this.fallbackReason(child), !KNOWN_TAGS.has(child.tagName)));
    }
    const extra = this.extras(attrs, classes, path, node);
    if (extra) column.extraAttributes = extra;
    return column;
  }

  fallbackReason(node: MjmlNode): string {
    switch (node.tagName) {
      case 'mj-social':
        return "The editor's Social block draws its own icons, so an mj-social would look different as one.";
      case 'mj-table':
        return "The editor's Table block styles every cell itself, so this table would look different as one.";
      case 'mj-hero':
        return "The editor's Hero block has no content of its own.";
      case 'mj-button':
        return 'A button without a link or a label cannot be an editor Button block.';
      case 'mj-image':
        return 'An image without a src cannot be an editor Image block.';
      default:
        return `The editor has no block for this <${node.tagName}> as it is written.`;
    }
  }

  socialButtons(children: MjmlNode[], start: number): { block: SocialBlock; end: number } | null {
    const read = (node: MjmlNode | undefined) => {
      if (!node || node.tagName !== 'mj-button') return null;
      const classes = (node.attributes['css-class'] ?? '').split(/\s+/);
      if (classes[0] !== 'el-social-btn' || !classes[1]?.startsWith('el-')) return null;
      const m = /^el-(.+)-([a-z]+)$/.exec(classes[1]);
      if (!m || !SOCIAL_PLATFORMS.has(m[2]!)) return null;
      return { id: m[1]!, platform: m[2]!, a: node.attributes };
    };
    const first = read(children[start]);
    if (!first) return null;
    const links: SocialLink[] = [];
    let end = start;
    let cur = first;
    while (cur && cur.id === first.id) {
      const color = cur.a['background-color'];
      links.push({ platform: cur.platform, url: cur.a.href ?? '', ...(color && color !== SOCIAL_COLORS[cur.platform] ? { color } : {}) });
      end += 1;
      cur = read(children[end])!;
    }
    const a = first.a;
    const block: SocialBlock = { id: this.id(first.id), type: 'social', mode: 'vertical', links };
    if (a.width) block.iconSize = a.width;
    if (a.padding) block.iconPadding = a.padding.split(/\s+/)[0];
    if (a['border-radius']) block.borderRadius = a['border-radius'];
    if (a.align === 'left' || a.align === 'center' || a.align === 'right') block.align = a.align;
    return { block, end };
  }

  // Blocks

  block(node: MjmlNode, path: string): Block | null {
    const attrs = { ...node.attributes };
    switch (node.tagName) {
      case 'mj-text':
        return this.text(node, attrs, path);
      case 'mj-image': {
        if (!attrs.src) return null;
        const { id, classes } = this.identity(attrs, 'el-image');
        const b: ImageBlock = { id: this.id(id), type: 'image', src: attrs.src };
        delete attrs.src;
        this.mapCommon(attrs, b, { alt: 'alt', width: 'width', height: 'height', href: 'href', 'border-radius': 'borderRadius' });
        this.mapEnum(attrs, b, 'align', 'align', ['left', 'center', 'right']);
        this.mapPadding(attrs, b);
        return this.finish(b, attrs, classes, path, node);
      }
      case 'mj-button': {
        const label = node.content ?? '';
        if (!attrs.href || label.trim() === '') return null;
        const { id, classes } = this.identity(attrs, 'el-button');
        const b: ButtonBlock = { id: this.id(id), type: 'button', label, href: attrs.href };
        delete attrs.href;
        this.mapCommon(attrs, b, {
          'background-color': 'backgroundColor',
          color: 'color',
          'border-radius': 'borderRadius',
          border: 'border',
          'inner-padding': 'innerPadding',
        });
        this.mapEnum(attrs, b, 'align', 'align', ['left', 'center', 'right']);
        this.mapPadding(attrs, b);
        return this.finish(b, attrs, classes, path, node);
      }
      case 'mj-divider': {
        const { id, classes } = this.identity(attrs, 'el-divider');
        const b: DividerBlock = { id: this.id(id), type: 'divider' };
        this.mapCommon(attrs, b, { 'border-color': 'borderColor', 'border-width': 'borderWidth', width: 'width' });
        this.mapEnum(attrs, b, 'border-style', 'borderStyle', ['solid', 'dashed', 'dotted']);
        this.mapPadding(attrs, b);
        return this.finish(b, attrs, classes, path, node);
      }
      case 'mj-spacer': {
        if (!attrs.height) return null;
        const { id, classes } = this.identity(attrs, 'el-spacer');
        const b = { id: this.id(id), type: 'spacer' as const, height: attrs.height };
        delete attrs.height;
        return this.finish(b, attrs, classes, path, node);
      }
      case 'mj-raw': {
        if (isComment(node)) return { id: this.id(), type: 'raw', html: node.content ?? '' };
        const social = /^\s*<table [^>]*data-ee-social="([A-Za-z0-9+/=]+)"/.exec(node.content ?? '');
        const decoded = decodeEditorData<SocialBlock>(social?.[1]);
        if (decoded && decoded.type === 'social' && Array.isArray(decoded.links)) {
          return { ...decoded, id: this.id(decoded.id) };
        }
        const { id, classes } = this.identity(attrs, 'el-raw');
        if (Object.keys(attrs).length > 0 || classes.length > 0) return null;
        return { id: this.id(id), type: 'raw', html: node.content ?? '' };
      }
      case 'mj-hero': {
        // Only the editor's own hero: its content is the compiler's fixed placeholder.
        const { id, classes } = this.identity(attrs, 'el-hero');
        if (!id || !attrs['background-url']) return null;
        const b: HeroBlock = { id: this.id(id), type: 'hero', backgroundImage: attrs['background-url'] };
        delete attrs['background-url'];
        this.mapCommon(attrs, b, {
          'background-height': 'backgroundHeight',
          'background-width': 'backgroundWidth',
          'background-color': 'backgroundColor',
        });
        this.mapEnum(attrs, b, 'vertical-align', 'verticalAlign', ['top', 'middle', 'bottom']);
        this.mapEnum(attrs, b, 'mode', 'mode', ['fixed-height', 'fluid-height']);
        return this.finish(b, attrs, classes, path, node);
      }
      case 'mj-accordion':
        return this.accordion(node, attrs, path);
      case 'mj-navbar':
        return this.navbar(node, attrs, path);
      case 'mj-carousel':
        return this.carousel(node, attrs, path);
      case 'mj-table':
        return this.table(node, attrs, path);
      case 'mj-wrapper': {
        const cls = (attrs['css-class'] ?? '').trim();
        if (cls === 'el-header-wrapper') return { id: this.id(), type: 'header', locked: true };
        if (cls === 'el-footer-wrapper') return { id: this.id(), type: 'footer', locked: true };
        return null;
      }
      default:
        return null;
    }
  }

  text(node: MjmlNode, attrs: Record<string, string>, path: string): TextBlock {
    const { id, classes } = this.identity(attrs, 'el-text');
    const b: TextBlock = { id: this.id(id), type: 'text', content: node.content ?? '' };
    this.mapEnum(attrs, b, 'align', 'align', ['left', 'center', 'right', 'justify']);
    this.mapCommon(attrs, b, { color: 'color', 'font-size': 'fontSize', 'font-family': 'fontFamily', 'line-height': 'lineHeight' });
    this.mapPadding(attrs, b);
    // The compiler wraps styled content in a div carrying the same styles: take it off again.
    const styles: string[] = [];
    if (b.align) styles.push(`text-align:${b.align}`);
    if (b.color) styles.push(`color:${b.color}`);
    if (b.fontSize) styles.push(`font-size:${b.fontSize}`);
    if (b.fontFamily) styles.push(`font-family:${b.fontFamily}`);
    if (b.lineHeight) styles.push(`line-height:${b.lineHeight}`);
    if (styles.length > 0) {
      const open = `<div style="${styles.join(';')}">`;
      if (b.content.startsWith(open) && b.content.endsWith('</div>')) {
        const inner = b.content.slice(open.length, -'</div>'.length);
        // Only when that div is one element wrapping everything, not the first of several.
        if (!/<\/div>/i.test(inner) || balancedDivs(inner)) b.content = inner;
      }
    }
    return this.finish(b, attrs, classes, path, node);
  }

  accordion(node: MjmlNode, attrs: Record<string, string>, path: string): AccordionBlock | null {
    const items: AccordionBlock['items'] = [];
    for (const el of node.children) {
      if (isComment(el)) return null;
      if (el.tagName !== 'mj-accordion-element' || Object.keys(el.attributes).length > 0) return null;
      const parts = el.children.filter((c) => !isComment(c));
      const title = parts.find((c) => c.tagName === 'mj-accordion-title');
      const text = parts.find((c) => c.tagName === 'mj-accordion-text');
      if (parts.length !== 2 || !title || !text || parts[0] !== title) return null;
      if (Object.keys(title.attributes).length > 0 || Object.keys(text.attributes).length > 0) return null;
      items.push({ title: title.content ?? '', content: text.content ?? '' });
    }
    const { id, classes } = this.identity(attrs, 'el-accordion');
    const b: AccordionBlock = { id: this.id(id), type: 'accordion', items };
    this.mapEnum(attrs, b, 'icon-position', 'iconPosition', ['left', 'right']);
    this.mapCommon(attrs, b, { border: 'borderColor', 'font-family': 'fontFamily' });
    return this.finish(b, attrs, classes, path, node);
  }

  navbar(node: MjmlNode, attrs: Record<string, string>, path: string): NavbarBlock | null {
    const links: NavbarBlock['links'] = [];
    for (const el of node.children) {
      if (el.tagName !== 'mj-navbar-link') return null;
      const { href, color, ...rest } = el.attributes;
      if (!href || Object.keys(rest).length > 0) return null;
      links.push({ href, label: el.content ?? '', ...(color ? { color } : {}) });
    }
    const { id, classes } = this.identity(attrs, 'el-navbar');
    const b: NavbarBlock = { id: this.id(id), type: 'navbar', links };
    if (attrs.hamburger === 'hamburger') {
      b.hamburger = true;
      delete attrs.hamburger;
    }
    this.mapCommon(attrs, b, { 'base-url': 'baseUrl', 'ico-color': 'icoColor' });
    this.mapEnum(attrs, b, 'align', 'align', ['left', 'center', 'right']);
    this.mapPadding(attrs, b);
    return this.finish(b, attrs, classes, path, node);
  }

  carousel(node: MjmlNode, attrs: Record<string, string>, path: string): CarouselBlock | null {
    const images: CarouselBlock['images'] = [];
    for (const el of node.children) {
      if (el.tagName !== 'mj-carousel-image') return null;
      const { src, alt, href, 'thumbnails-src': thumbnailSrc, ...rest } = el.attributes;
      if (!src || Object.keys(rest).length > 0) return null;
      images.push({ src, ...(alt ? { alt } : {}), ...(href ? { href } : {}), ...(thumbnailSrc ? { thumbnailSrc } : {}) });
    }
    const { id, classes } = this.identity(attrs, 'el-carousel');
    const b: CarouselBlock = { id: this.id(id), type: 'carousel', images };
    this.mapEnum(attrs, b, 'thumbnails', 'thumbnails', ['visible', 'hidden']);
    this.mapCommon(attrs, b, { 'border-radius': 'borderRadius', 'icon-width': 'iconWidth', 'tb-border-radius': 'tbBorderRadius' });
    this.mapPadding(attrs, b);
    return this.finish(b, attrs, classes, path, node);
  }

  /** Only the editor's own table (`el-table`), whose markup the compiler writes in one exact shape. */
  table(node: MjmlNode, attrs: Record<string, string>, path: string): TableBlock | null {
    const { id, classes } = this.identity(attrs, 'el-table');
    if (!id) return null;
    const lines = (node.content ?? '').split('\n');
    const head = /^<tr style="background-color: #f5f5f5;">(.*)<\/tr>$/.exec(lines[0] ?? '');
    if (!head) return null;
    const cells = (row: string, tag: 'th' | 'td', style: string) => {
      const out: string[] = [];
      const open = `<${tag} style="${style}">`;
      let rest = row;
      while (rest.length > 0) {
        if (!rest.startsWith(open)) return null;
        const close = rest.indexOf(`</${tag}>`);
        if (close < 0) return null;
        out.push(rest.slice(open.length, close));
        rest = rest.slice(close + tag.length + 3);
      }
      return out;
    };
    const headers = cells(head[1]!, 'th', 'padding: 8px; border-bottom: 1px solid #ddd; text-align: left;');
    if (!headers) return null;
    const rows: string[][] = [];
    for (const line of lines.slice(1)) {
      const m = /^<tr>(.*)<\/tr>$/.exec(line);
      const row = m ? cells(m[1]!, 'td', 'padding: 8px; border-bottom: 1px solid #eee;') : null;
      if (!row) return null;
      rows.push(row);
    }
    const b: TableBlock = { id: this.id(id), type: 'table', headers, rows };
    this.mapEnum(attrs, b, 'align', 'align', ['left', 'center', 'right']);
    this.mapCommon(attrs, b, {
      color: 'color',
      'font-family': 'fontFamily',
      'font-size': 'fontSize',
      cellpadding: 'cellpadding',
      cellspacing: 'cellspacing',
      border: 'border',
    });
    this.mapPadding(attrs, b);
    return this.finish(b, attrs, classes, path, node);
  }

  // Attribute helpers

  mapCommon<T extends object>(attrs: Record<string, string>, target: T, map: Record<string, string>) {
    for (const [attr, field] of Object.entries(map)) {
      if (attrs[attr] === undefined) continue;
      (target as Record<string, unknown>)[field] = attrs[attr];
      delete attrs[attr];
    }
  }

  mapEnum<T extends object>(attrs: Record<string, string>, target: T, attr: string, field: string, allowed: string[]) {
    const v = attrs[attr];
    if (v !== undefined && allowed.includes(v)) {
      (target as Record<string, unknown>)[field] = v;
      delete attrs[attr];
    }
  }

  mapPadding(attrs: Record<string, string>, target: { padding?: Spacing }) {
    if (attrs.padding === undefined) return;
    const spacing = parsePadding(attrs.padding);
    if (spacing) {
      target.padding = spacing;
      delete attrs.padding;
    }
  }

  finish<T extends Block>(block: T, attrs: Record<string, string>, classes: string[], path: string, node: MjmlNode): T {
    const extra = this.extras(attrs, classes, path, node);
    if (extra) block.extraAttributes = extra;
    return block;
  }

  // Fallbacks: compile the whole source once, with each fallback marked, and cut them out.

  resolveFallbacks(metadata: TemplateMetadata): void {
    if (this.fallbacks.length === 0) return;
    const marker = (i: number, edge: 'start' | 'end'): MjmlNode => ({
      tagName: 'mj-raw',
      attributes: {},
      content: `<!--ee-import-${i}-${edge}-->`,
      children: [],
    });
    for (const [i, f] of this.fallbacks.entries()) {
      const at = f.parent.children.indexOf(f.node);
      f.parent.children.splice(at, 1, marker(i, 'start'), f.node, marker(i, 'end'));
    }
    let html = '';
    try {
      // Never resolve <mj-include>: its path is read from the server's disk.
      // The scan already refused every include; this is the second lock.
      html = mjml2html(serialize(this.root), { ignoreIncludes: true, validationLevel: 'skip', minify: false, keepComments: true }).html;
    } catch {
      html = '';
    }
    const needed: string[] = [];
    for (const [i, f] of this.fallbacks.entries()) {
      const start = html.indexOf(`<!--ee-import-${i}-start-->`);
      const end = html.indexOf(`<!--ee-import-${i}-end-->`);
      let fragment = start >= 0 && end > start ? html.slice(start + `<!--ee-import-${i}-start-->`.length, end).trim() : '';
      if (f.unknown || fragment === '') {
        const source = serialize(f.node).replace(/--/g, '- -');
        fragment = `<!-- Imported MJML that renders nothing: ${source} -->`;
      }
      f.block.html = fragment;
      needed.push(fragment);
    }
    const css = supportingCss(html, needed.join('\n'), metadata.breakpoint);
    if (css) metadata.customCSS = metadata.customCSS ? `${metadata.customCSS}\n${css}` : css;
  }

  summarize(): void {
    if (this.kept.size > 0) {
      const list = [...this.kept.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} (${n})`).join(', ');
      this.warnings.push({
        severity: 'info',
        code: 'attribute_kept',
        path: 'mj-body',
        message: `Attributes the editor has no control for are kept and apply to the mail as before: ${list}. The editor canvas may not show their effect.`,
      });
    }
    if (this.hasOwnDefaults || this.usesMjClass) {
      this.warnings.push({
        severity: 'info',
        code: 'document_defaults',
        path: 'mj-head > mj-attributes',
        message: 'The document-wide defaults (mj-attributes, mj-class) are kept and apply to the mail. The editor canvas shows blocks without them, so the preview is the reference for how the mail looks.',
      });
    }
  }
}

function balancedDivs(html: string): boolean {
  let depth = 0;
  for (const m of html.matchAll(/<(\/?)div\b[^>]*>/gi)) {
    depth += m[1] ? -1 : 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * CSS a fallback's HTML needs from the head of the compiled source: the
 * responsive column widths it uses, and the style blocks of interactive
 * components (accordion, carousel, navbar menu) when it contains one.
 */
function supportingCss(fullHtml: string, fragments: string, breakpoint = '480px'): string {
  const out: string[] = [];
  const classes = new Set([...fragments.matchAll(/mj-column-(?:per|px)-[0-9-]+/g)].map((m) => m[0]));
  const rules: string[] = [];
  for (const cls of classes) {
    const m = new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`).exec(fullHtml);
    if (m) rules.push(m[0]);
  }
  if (rules.length > 0) out.push(`@media only screen and (min-width:${breakpoint}) { ${rules.join(' ')} }`);
  const styles = [...fullHtml.matchAll(/<style type="text\/css">([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
  for (const token of ['mj-accordion', 'mj-carousel', 'mj-menu']) {
    if (!fragments.includes(token)) continue;
    for (const s of styles) if (s.includes(token) && !out.includes(s.trim())) out.push(s.trim());
  }
  return out.join('\n');
}

/**
 * Reads an MJML document into the editor's document model.
 *
 * Throws {@link MjmlImportError} when the source cannot be read at all (not
 * well-formed, not MJML, an `mj-include`, over a limit). Everything else
 * imports: what the editor cannot hold as a block is kept as compiled HTML,
 * and every such change is in `warnings`. The document has passed
 * `migrateTemplate`. Server only: it compiles fallbacks with mjml.
 */
export function importMjml(source: string): MjmlImportResult {
  if (typeof source !== 'string') throw new MjmlImportError('not_mjml', 'The MJML must be a string.');
  scanMjml(source, ENDING_TAGS);
  const root = parseMjml(source);
  if (root.tagName !== 'mjml') throw new MjmlImportError('not_mjml', 'The document must start with <mjml>.');
  const head = root.children.find((c) => c.tagName === 'mj-head');
  const body = root.children.find((c) => c.tagName === 'mj-body');
  if (!body) throw new MjmlImportError('not_mjml', 'The document has no <mj-body>.');

  const importer = new Importer(root);
  for (const [i, c] of root.children.entries()) {
    if (c !== head && c !== body && !isComment(c)) {
      importer.warn('stray_text', 'info', `mjml > ${c.tagName}[${i + 1}]`, c, `<${c.tagName}> outside mj-head and mj-body is ignored by MJML, and by the import.`, true);
    }
  }
  // The head first: the editor's gradient rules in it are read back onto sections and columns.
  const metadata = importer.head(head, body);
  const sections = importer.body(body);
  importer.resolveFallbacks(metadata);
  importer.summarize();

  const document: EmailTemplate = { version: '1.0', metadata, sections };
  try {
    migrateTemplate(document);
  } catch (err) {
    const detail = isTemplateMigrationError(err) ? err.message : String(err);
    throw new MjmlImportError('invalid_document', `The imported document does not pass the editor's schema: ${detail}`);
  }
  return { document, warnings: importer.warnings };
}
