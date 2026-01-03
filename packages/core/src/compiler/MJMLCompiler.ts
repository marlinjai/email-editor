// packages/core/src/compiler/MJMLCompiler.ts
// Converts EmailTemplate JSON to MJML and HTML

import mjml2html from 'mjml';
import type {
  EmailTemplate,
  Section,
  Column,
  Block,
  Spacing,
  CompileResult,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  DividerBlock,
  SpacerBlock,
} from '../schema/types';

/**
 * Converts spacing object to MJML attribute string
 */
function spacingToString(spacing?: Spacing): string {
  if (!spacing) return '';
  const parts: string[] = [];
  if (spacing.top) parts.push(spacing.top);
  if (spacing.right) parts.push(spacing.right);
  if (spacing.bottom) parts.push(spacing.bottom);
  if (spacing.left) parts.push(spacing.left);
  return parts.join(' ') || '';
}

/**
 * MJML Compiler class
 * Converts EmailTemplate to MJML markup and compiles to HTML
 */
export class MJMLCompiler {
  /**
   * Compile email template to MJML and HTML
   */
  compile(template: EmailTemplate): CompileResult {
    try {
      const mjml = this.templateToMJML(template);
      const result = mjml2html(mjml, {
        validationLevel: 'soft',
        minify: false,
      });

      return {
        mjml,
        html: result.html,
        errors: result.errors.length > 0 
          ? result.errors.map((e) => e.formattedMessage) 
          : undefined,
      };
    } catch (error) {
      return {
        mjml: '',
        html: '',
        errors: [error instanceof Error ? error.message : 'Unknown compilation error'],
      };
    }
  }

  /**
   * Convert template to MJML markup
   */
  private templateToMJML(template: EmailTemplate): string {
    const { metadata, sections } = template;
    
    const head = this.generateHead(metadata);
    const body = sections.map((section) => this.sectionToMJML(section)).join('\n');

    return `
<mjml>
  ${head}
  <mj-body>
    ${body}
  </mj-body>
</mjml>
    `.trim();
  }

  /**
   * Generate MJML head section
   */
  private generateHead(metadata: EmailTemplate['metadata']): string {
    const parts: string[] = ['<mj-head>'];

    if (metadata.subject || metadata.previewText) {
      parts.push('<mj-preview>');
      parts.push(metadata.previewText || metadata.subject || '');
      parts.push('</mj-preview>');
    }

    // Add default attributes
    parts.push(`
      <mj-attributes>
        <mj-all font-family="Georgia, serif" />
        <mj-text font-size="14px" line-height="1.6" />
      </mj-attributes>
    `);

    parts.push('</mj-head>');
    return parts.join('\n');
  }

  /**
   * Convert section to MJML
   */
  private sectionToMJML(section: Section): string {
    const attrs: string[] = [];

    if (section.backgroundColor) {
      attrs.push(`background-color="${section.backgroundColor}"`);
    }
    if (section.backgroundImage) {
      attrs.push(`background-url="${section.backgroundImage}"`);
    }
    if (section.padding) {
      const padding = spacingToString(section.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const columns = section.columns.map((col) => this.columnToMJML(col)).join('\n');

    return `
<mj-section ${attrs.join(' ')}>
  ${columns}
</mj-section>
    `.trim();
  }

  /**
   * Convert column to MJML
   */
  private columnToMJML(column: Column): string {
    const attrs: string[] = [];
    
    if (column.width) {
      attrs.push(`width="${column.width}%"`);
    }

    const blocks = column.blocks.map((block) => this.blockToMJML(block)).join('\n');

    return `
<mj-column ${attrs.join(' ')}>
  ${blocks}
</mj-column>
    `.trim();
  }

  /**
   * Convert block to MJML based on type
   */
  private blockToMJML(block: Block): string {
    switch (block.type) {
      case 'text':
        return this.textBlockToMJML(block);
      case 'image':
        return this.imageBlockToMJML(block);
      case 'button':
        return this.buttonBlockToMJML(block);
      case 'divider':
        return this.dividerBlockToMJML(block);
      case 'spacer':
        return this.spacerBlockToMJML(block);
      case 'header':
        return this.headerBlockToMJML();
      case 'footer':
        return this.footerBlockToMJML();
      default:
        console.warn(`Unknown block type: ${(block as Block).type}`);
        return '';
    }
  }

  /**
   * Convert text block to MJML
   */
  private textBlockToMJML(block: TextBlock): string {
    const attrs: string[] = [];

    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.fontSize) attrs.push(`font-size="${block.fontSize}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);
    if (block.lineHeight) attrs.push(`line-height="${block.lineHeight}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-text ${attrs.join(' ')}>${block.content}</mj-text>`;
  }

  /**
   * Convert image block to MJML
   */
  private imageBlockToMJML(block: ImageBlock): string {
    const attrs: string[] = [`src="${block.src}"`];

    if (block.alt) attrs.push(`alt="${block.alt}"`);
    if (block.width) attrs.push(`width="${block.width}"`);
    if (block.height) attrs.push(`height="${block.height}"`);
    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.href) attrs.push(`href="${block.href}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-image ${attrs.join(' ')} />`;
  }

  /**
   * Convert button block to MJML
   */
  private buttonBlockToMJML(block: ButtonBlock): string {
    const attrs: string[] = [`href="${block.href}"`];

    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.backgroundColor) attrs.push(`background-color="${block.backgroundColor}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.borderRadius) attrs.push(`border-radius="${block.borderRadius}"`);
    if (block.innerPadding) attrs.push(`inner-padding="${block.innerPadding}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-button ${attrs.join(' ')}>${block.label}</mj-button>`;
  }

  /**
   * Convert divider block to MJML
   */
  private dividerBlockToMJML(block: DividerBlock): string {
    const attrs: string[] = [];

    if (block.borderColor) attrs.push(`border-color="${block.borderColor}"`);
    if (block.borderWidth) attrs.push(`border-width="${block.borderWidth}"`);
    if (block.borderStyle) attrs.push(`border-style="${block.borderStyle}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-divider ${attrs.join(' ')} />`;
  }

  /**
   * Convert spacer block to MJML
   */
  private spacerBlockToMJML(block: SpacerBlock): string {
    return `<mj-spacer height="${block.height}" />`;
  }

  /**
   * Generate branded header block
   */
  private headerBlockToMJML(): string {
    return `
<mj-wrapper background-color="#ffffff" padding="20px">
  <mj-section>
    <mj-column>
      <mj-image src="https://placeholder.com/70x70" width="70px" align="center" />
      <mj-text align="center" font-size="24px" color="#944923" font-family="Georgia, serif">
        Welcome to the ReTurn Newsletter
      </mj-text>
    </mj-column>
  </mj-section>
</mj-wrapper>
    `.trim();
  }

  /**
   * Generate branded footer block
   */
  private footerBlockToMJML(): string {
    return `
<mj-wrapper background-color="#f5f5f5" padding="20px">
  <mj-section>
    <mj-column>
      <mj-text align="center" font-size="12px" color="#666666">
        © ${new Date().getFullYear()} ReTurn Hypnosis. All rights reserved.
      </mj-text>
      <mj-text align="center" font-size="12px" color="#666666">
        <a href="{{unsubscribe_url}}" style="color: #944923; text-decoration: underline;">Unsubscribe</a>
      </mj-text>
    </mj-column>
  </mj-section>
</mj-wrapper>
    `.trim();
  }
}

/**
 * Create a new MJML compiler instance
 */
export function createMJMLCompiler(): MJMLCompiler {
  return new MJMLCompiler();
}

