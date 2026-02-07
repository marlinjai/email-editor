// packages/core/src/store/mst/MJMLExporter.ts
/**
 * MJML Exporter - Converts MST template to MJML/HTML
 *
 * This exporter is called ONLY when the user clicks Export/Send,
 * NOT during editing. This separation is key to achieving instant
 * visual feedback during editing.
 *
 * IMPORTANT: This file should only be imported on the server side
 * as it uses the mjml package which is not browser-safe.
 */

import mjml2html from 'mjml';
import type { TemplateInstance } from './models/TemplateModel';
import type { SectionInstance } from './models/SectionModel';
import type { ColumnInstance } from './models/ColumnModel';
import type { BlockInstance } from './models/BlockModel';
import { BlockType } from './models/BlockModel';

/**
 * Result of MJML export
 */
export interface ExportResult {
  /** Raw MJML markup */
  mjml: string;
  /** Compiled HTML */
  html: string;
  /** Any compilation errors */
  errors?: string[];
}

/**
 * Export options
 */
export interface ExportOptions {
  /** MJML validation level */
  validationLevel?: 'strict' | 'soft' | 'skip';
  /** Minify output HTML */
  minify?: boolean;
  /** Add beautiful comments for debugging */
  beautify?: boolean;
}

/**
 * MJMLExporter - Exports MST template to MJML and HTML
 *
 * This class converts the live MST model to MJML markup,
 * then compiles it to HTML using the mjml package.
 */
export class MJMLExporter {
  private options: Required<ExportOptions>;

  constructor(options: ExportOptions = {}) {
    this.options = {
      validationLevel: options.validationLevel || 'soft',
      minify: options.minify ?? false,
      beautify: options.beautify ?? false,
    };
  }

  /**
   * Export template to MJML + HTML
   */
  export(template: TemplateInstance): ExportResult {
    const mjml = this.templateToMJML(template);

    const result = mjml2html(mjml, {
      validationLevel: this.options.validationLevel,
      minify: this.options.minify,
      beautify: this.options.beautify,
    });

    return {
      mjml,
      html: result.html,
      errors: result.errors.length > 0
        ? result.errors.map(e => e.formattedMessage)
        : undefined,
    };
  }

  /**
   * Export only MJML (without HTML compilation)
   */
  exportMJML(template: TemplateInstance): string {
    return this.templateToMJML(template);
  }

  /**
   * Convert template to MJML markup
   */
  private templateToMJML(template: TemplateInstance): string {
    const { metadata } = template;

    // Build visible sections
    const sectionsMarkup = template.visibleSections
      .map(section => this.sectionToMJML(section))
      .join('\n    ');

    // Build custom fonts
    const fontsMarkup = metadata.fonts
      .map(font => `<mj-font name="${this.escapeAttr(font.name)}" href="${this.escapeAttr(font.href)}" />`)
      .join('\n      ');

    // Build custom styles
    const stylesMarkup = metadata.customCSS
      ? `<mj-style>${metadata.customCSS}</mj-style>`
      : '';

    const inlineStylesMarkup = metadata.inlineCSS
      ? `<mj-style inline="inline">${metadata.inlineCSS}</mj-style>`
      : '';

    return `
<mjml>
  <mj-head>
    <mj-title>${this.escapeContent(metadata.title)}</mj-title>
    <mj-preview>${this.escapeContent(metadata.previewText)}</mj-preview>
    ${metadata.breakpoint ? `<mj-breakpoint width="${metadata.breakpoint}" />` : ''}
    <mj-attributes>
      <mj-all font-family="Georgia, serif" />
      <mj-text font-size="14px" line-height="1.6" />
    </mj-attributes>
    ${fontsMarkup}
    ${stylesMarkup}
    ${inlineStylesMarkup}
  </mj-head>
  <mj-body>
    ${sectionsMarkup}
  </mj-body>
</mjml>
    `.trim();
  }

  /**
   * Convert section to MJML markup
   */
  private sectionToMJML(section: SectionInstance): string {
    const attrs = this.buildAttributes(section.mjmlAttributes);

    // Use mj-group for noStack sections (keeps columns side-by-side on mobile)
    const containerTag = section.noStack ? 'mj-group' : 'mj-section';

    const columnsMarkup = section.visibleColumns
      .map(column => this.columnToMJML(column))
      .join('\n      ');

    // mj-section or mj-wrapper based on isWrapper
    if (section.isWrapper) {
      return `
    <mj-wrapper${attrs}>
      <mj-section>
        ${columnsMarkup}
      </mj-section>
    </mj-wrapper>`;
    }

    return `
    <${containerTag}${attrs}>
      ${columnsMarkup}
    </${containerTag}>`;
  }

  /**
   * Convert column to MJML markup
   */
  private columnToMJML(column: ColumnInstance): string {
    const attrs = this.buildAttributes(column.mjmlAttributes);

    const blocksMarkup = column.visibleBlocks
      .map(block => this.blockToMJML(block))
      .join('\n        ');

    return `
      <mj-column${attrs}>
        ${blocksMarkup}
      </mj-column>`;
  }

  /**
   * Convert block to MJML markup
   */
  private blockToMJML(block: BlockInstance): string {
    const attrs = this.buildAttributes(block.mjmlAttributes);

    switch (block.type) {
      case BlockType.TEXT:
        return `<mj-text${attrs}>${block.content}</mj-text>`;

      case BlockType.IMAGE:
        return `<mj-image${attrs} />`;

      case BlockType.BUTTON:
        return `<mj-button${attrs}>${this.escapeContent(block.label || 'Click Here')}</mj-button>`;

      case BlockType.DIVIDER:
        return `<mj-divider${attrs} />`;

      case BlockType.SPACER:
        const spacerAttrs = block.height ? ` height="${block.height}"` : ' height="20px"';
        return `<mj-spacer${spacerAttrs} />`;

      case BlockType.SOCIAL:
        return this.socialBlockToMJML(block);

      case BlockType.HERO:
        return this.heroBlockToMJML(block);

      case BlockType.ACCORDION:
        return this.accordionBlockToMJML(block);

      case BlockType.RAW:
        return `<mj-raw>${block.html || ''}</mj-raw>`;

      case BlockType.NAVBAR:
        return this.navbarBlockToMJML(block);

      case BlockType.CAROUSEL:
        return this.carouselBlockToMJML(block);

      case BlockType.TABLE:
        return this.tableBlockToMJML(block);

      case BlockType.HEADER:
        return this.headerBlockToMJML(block);

      case BlockType.FOOTER:
        return this.footerBlockToMJML(block);

      default:
        return `<!-- Unknown block type: ${block.type} -->`;
    }
  }

  /**
   * Convert social block to MJML
   */
  private socialBlockToMJML(block: BlockInstance): string {
    const baseAttrs: string[] = [];
    if (block.iconSize) baseAttrs.push(`icon-size="${block.iconSize}"`);
    if (block.iconPadding) baseAttrs.push(`icon-padding="${block.iconPadding}"`);
    if (block.borderRadius) baseAttrs.push(`border-radius="${block.borderRadius}"`);
    if (block.align) baseAttrs.push(`align="${block.align}"`);
    if (block.mode === 'vertical') baseAttrs.push(`mode="vertical"`);

    const elements = block.links
      .map(link => {
        const elemAttrs = [`name="${this.escapeAttr(link.platform)}"`, `href="${this.escapeAttr(link.url)}"`];
        if (link.color) elemAttrs.push(`icon-color="${link.color}"`);
        return `<mj-social-element ${elemAttrs.join(' ')} />`;
      })
      .join('\n          ');

    return `
        <mj-social${baseAttrs.length ? ' ' + baseAttrs.join(' ') : ''}>
          ${elements}
        </mj-social>`;
  }

  /**
   * Convert hero block to MJML
   */
  private heroBlockToMJML(block: BlockInstance): string {
    const attrs: string[] = [];
    if (block.backgroundImage) attrs.push(`background-url="${this.escapeAttr(block.backgroundImage)}"`);
    if (block.backgroundHeight) attrs.push(`background-height="${block.backgroundHeight}"`);
    if (block.backgroundWidth) attrs.push(`background-width="${block.backgroundWidth}"`);
    if (block.backgroundColor) attrs.push(`background-color="${block.backgroundColor}"`);
    if (block.verticalAlign) attrs.push(`vertical-align="${block.verticalAlign}"`);
    if (block.mode) attrs.push(`mode="${block.mode}"`);

    return `
        <mj-hero${attrs.length ? ' ' + attrs.join(' ') : ''}>
          <mj-text>${block.content}</mj-text>
        </mj-hero>`;
  }

  /**
   * Convert accordion block to MJML
   */
  private accordionBlockToMJML(block: BlockInstance): string {
    const attrs: string[] = [];
    if (block.iconPosition) attrs.push(`icon-position="${block.iconPosition}"`);
    if (block.borderColor) attrs.push(`border="${block.borderColor}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);

    const items = block.items
      .map(item => `
          <mj-accordion-element>
            <mj-accordion-title>${this.escapeContent(item.title)}</mj-accordion-title>
            <mj-accordion-text>${item.content}</mj-accordion-text>
          </mj-accordion-element>`)
      .join('');

    return `
        <mj-accordion${attrs.length ? ' ' + attrs.join(' ') : ''}>
          ${items}
        </mj-accordion>`;
  }

  /**
   * Convert navbar block to MJML
   */
  private navbarBlockToMJML(block: BlockInstance): string {
    const attrs: string[] = [];
    if (block.hamburger) attrs.push(`hamburger="hamburger"`);
    if (block.baseUrl) attrs.push(`base-url="${this.escapeAttr(block.baseUrl)}"`);
    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.icoColor) attrs.push(`ico-color="${block.icoColor}"`);

    const links = block.navLinks
      .map(link => {
        const linkAttrs = [`href="${this.escapeAttr(link.href)}"`];
        if (link.color) linkAttrs.push(`color="${link.color}"`);
        return `<mj-navbar-link ${linkAttrs.join(' ')}>${this.escapeContent(link.label)}</mj-navbar-link>`;
      })
      .join('\n          ');

    return `
        <mj-navbar${attrs.length ? ' ' + attrs.join(' ') : ''}>
          ${links}
        </mj-navbar>`;
  }

  /**
   * Convert carousel block to MJML
   */
  private carouselBlockToMJML(block: BlockInstance): string {
    const attrs: string[] = [];
    if (block.thumbnails) attrs.push(`thumbnails="${block.thumbnails}"`);
    if (block.borderRadius) attrs.push(`border-radius="${block.borderRadius}"`);
    if (block.iconWidth) attrs.push(`icon-width="${block.iconWidth}"`);
    if (block.tbBorderRadius) attrs.push(`tb-border-radius="${block.tbBorderRadius}"`);

    const images = block.images
      .map(img => {
        const imgAttrs = [`src="${this.escapeAttr(img.src)}"`];
        if (img.alt) imgAttrs.push(`alt="${this.escapeAttr(img.alt)}"`);
        if (img.href) imgAttrs.push(`href="${this.escapeAttr(img.href)}"`);
        if (img.thumbnailSrc) imgAttrs.push(`thumbnails-src="${this.escapeAttr(img.thumbnailSrc)}"`);
        return `<mj-carousel-image ${imgAttrs.join(' ')} />`;
      })
      .join('\n          ');

    return `
        <mj-carousel${attrs.length ? ' ' + attrs.join(' ') : ''}>
          ${images}
        </mj-carousel>`;
  }

  /**
   * Convert table block to MJML
   */
  private tableBlockToMJML(block: BlockInstance): string {
    const attrs: string[] = [];
    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);
    if (block.fontSize) attrs.push(`font-size="${block.fontSize}"`);
    if (block.cellpadding) attrs.push(`cellpadding="${block.cellpadding}"`);
    if (block.cellspacing) attrs.push(`cellspacing="${block.cellspacing}"`);
    if (block.border) attrs.push(`border="${block.border}"`);

    // Build table HTML
    const headerCells = block.headers
      .map(h => `<th>${this.escapeContent(h)}</th>`)
      .join('');

    const rows = block.rows
      .map(row => `<tr>${row.map(cell => `<td>${this.escapeContent(cell)}</td>`).join('')}</tr>`)
      .join('\n');

    const tableHtml = `
      <table>
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    return `<mj-table${attrs.length ? ' ' + attrs.join(' ') : ''}>${tableHtml}</mj-table>`;
  }

  /**
   * Convert header block to MJML (branded header)
   */
  private headerBlockToMJML(block: BlockInstance): string {
    // This would typically render a predefined branded header
    // The actual content would come from a brand configuration
    return `
        <mj-section background-color="#f8f9fa">
          <mj-column>
            <mj-text align="center" font-size="24px" font-weight="bold">
              <!-- Branded Header -->
            </mj-text>
          </mj-column>
        </mj-section>`;
  }

  /**
   * Convert footer block to MJML (branded footer)
   */
  private footerBlockToMJML(block: BlockInstance): string {
    // This would typically render a predefined branded footer
    // The actual content would come from a brand configuration
    return `
        <mj-section background-color="#f8f9fa">
          <mj-column>
            <mj-text align="center" font-size="12px" color="#6c757d">
              <!-- Branded Footer -->
            </mj-text>
          </mj-column>
        </mj-section>`;
  }

  /**
   * Build attribute string from object
   */
  private buildAttributes(attrs: Record<string, string>): string {
    const entries = Object.entries(attrs).filter(([_, v]) => v != null && v !== '');
    if (entries.length === 0) return '';
    return ' ' + entries.map(([k, v]) => `${k}="${this.escapeAttr(v)}"`).join(' ');
  }

  /**
   * Escape HTML attribute value
   */
  private escapeAttr(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape HTML content
   */
  private escapeContent(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

/**
 * Create a new MJML exporter with default options
 */
export function createMJMLExporter(options?: ExportOptions): MJMLExporter {
  return new MJMLExporter(options);
}

/**
 * Quick export function for simple use cases
 */
export function exportTemplate(template: TemplateInstance, options?: ExportOptions): ExportResult {
  const exporter = new MJMLExporter(options);
  return exporter.export(template);
}
