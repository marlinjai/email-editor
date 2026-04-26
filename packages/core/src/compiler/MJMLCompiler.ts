// packages/core/src/compiler/MJMLCompiler.ts
// Converts EmailTemplate JSON to MJML and HTML
// SERVER-SIDE ONLY - Do not import in client code

import mjml2html from 'mjml';
import { blockToRawHtml } from './blockToRawHtml';
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
  SocialBlock,
  SocialLink,
  HeroBlock,
  AccordionBlock,
  AccordionItem,
  RawBlock,
  NavbarBlock,
  NavbarLink,
  CarouselBlock,
  CarouselImage,
  TableBlock,
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
   * Set true while emitting a column with sub-columns. Causes generateHead
   * to inject the responsive media query exactly once per template.
   */
  private needsSubColumnStyles = false;

  /**
   * Compile email template to MJML and HTML
   */
  compile(template: EmailTemplate): CompileResult {
    try {
      this.needsSubColumnStyles = false;
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

    // Render body first so columnToMJML can flip the needsSubColumnStyles
    // flag before we generate the head.
    const body = sections.map((section) => this.sectionToMJML(section)).join('\n');
    const head = this.generateHead(metadata);

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
   * Generate MJML head section with all head components
   * Supports: mj-title, mj-preview, mj-font, mj-breakpoint, mj-style
   */
  private generateHead(metadata: EmailTemplate['metadata']): string {
    const parts: string[] = ['<mj-head>'];

    // mj-title - Sets the document title
    if (metadata.title) {
      parts.push(`<mj-title>${metadata.title}</mj-title>`);
    }

    // mj-preview - Sets the preview text in email clients
    if (metadata.previewText || metadata.subject) {
      parts.push(`<mj-preview>${metadata.previewText || metadata.subject || ''}</mj-preview>`);
    }

    // mj-font - Custom font imports
    if (metadata.fonts && metadata.fonts.length > 0) {
      for (const font of metadata.fonts) {
        parts.push(`<mj-font name="${font.name}" href="${font.href}" />`);
      }
    }

    // mj-breakpoint - Mobile breakpoint
    if (metadata.breakpoint) {
      parts.push(`<mj-breakpoint width="${metadata.breakpoint}" />`);
    }

    // Add default attributes
    parts.push(`
      <mj-attributes>
        <mj-all font-family="Georgia, serif" />
        <mj-text font-size="14px" line-height="1.6" />
      </mj-attributes>
    `);

    // mj-style - Custom CSS
    if (metadata.customCSS) {
      parts.push(`<mj-style>${metadata.customCSS}</mj-style>`);
    }

    // mj-style inline - Inline CSS
    if (metadata.inlineCSS) {
      parts.push(`<mj-style inline="inline">${metadata.inlineCSS}</mj-style>`);
    }

    // Responsive media query for nested sub-columns. Only emitted when
    // any column in the template uses sub-columns.
    if (this.needsSubColumnStyles) {
      parts.push(`<mj-style>
@media only screen and (max-width:480px) {
  table.ee-sub-cols td.ee-sub-col {
    display: block !important;
    width: 100% !important;
    padding-bottom: 12px !important;
  }
  table.ee-sub-cols td.ee-sub-col:last-child {
    padding-bottom: 0 !important;
  }
}
</mj-style>`);
    }

    parts.push('</mj-head>');
    return parts.join('\n');
  }

  /**
   * Convert section to MJML
   * Supports mj-section or mj-wrapper (with isWrapper flag)
   * Supports background images, full-width, and mj-group for non-stacking columns
   */
  private sectionToMJML(section: Section): string {
    // Skip hidden sections
    if (section.hidden) return '';

    const attrs: string[] = [];

    if (section.backgroundColor) {
      attrs.push(`background-color="${section.backgroundColor}"`);
    }
    if (section.backgroundImage) {
      attrs.push(`background-url="${section.backgroundImage}"`);
    }
    if (section.backgroundPosition) {
      attrs.push(`background-position="${section.backgroundPosition}"`);
    }
    if (section.backgroundRepeat) {
      attrs.push(`background-repeat="${section.backgroundRepeat}"`);
    }
    if (section.backgroundSize) {
      attrs.push(`background-size="${section.backgroundSize}"`);
    }
    if (section.fullWidth) {
      attrs.push('full-width="full-width"');
    }
    if (section.padding) {
      const padding = spacingToString(section.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const columns = section.columns.map((col) => this.columnToMJML(col)).join('\n');

    // Use mj-wrapper for wrapper sections
    if (section.isWrapper) {
      return `
<mj-wrapper ${attrs.join(' ')} css-class="el-wrapper el-${section.id}">
  <mj-section>
    ${columns}
  </mj-section>
</mj-wrapper>
      `.trim();
    }

    // Use mj-group for non-stacking columns (prevents mobile stacking)
    if (section.noStack && section.columns.length > 1) {
      return `
<mj-section ${attrs.join(' ')} css-class="el-section el-${section.id}">
  <mj-group>
    ${columns}
  </mj-group>
</mj-section>
      `.trim();
    }

    return `
<mj-section ${attrs.join(' ')} css-class="el-section el-${section.id}">
  ${columns}
</mj-section>
    `.trim();
  }

  /**
   * Convert column to MJML
   */
  private columnToMJML(column: Column): string {
    // Skip hidden columns
    if (column.hidden) return '';

    // Group-kind: emit a sealed mj-raw nested table for the sub-columns.
    if (column.subColumns && column.subColumns.length > 0) {
      return this.subColumnsToMJML(column);
    }

    const attrs: string[] = [`css-class="el-column el-${column.id}"`];
    
    if (column.width) {
      attrs.push(`width="${column.width}%"`);
    }
    if (column.backgroundColor) {
      attrs.push(`background-color="${column.backgroundColor}"`);
    }
    if (column.verticalAlign) {
      attrs.push(`vertical-align="${column.verticalAlign}"`);
    }
    if (column.padding) {
      const padding = spacingToString(column.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const blocks = column.blocks.map((block) => this.blockToMJML(block)).join('\n');

    return `
<mj-column ${attrs.join(' ')}>
  ${blocks}
</mj-column>
    `.trim();
  }

  /**
   * Emit a group column as an mj-column wrapping a hand-built nested
   * table inside an mj-raw island. The parent mj-section structure
   * stays standard MJML; only the nested area escapes MJML's parser.
   *
   * The responsive media query (table.ee-sub-cols td.ee-sub-col) is
   * injected once at document head via generateHead when the
   * needsSubColumnStyles flag is set.
   */
  private subColumnsToMJML(column: Column): string {
    this.needsSubColumnStyles = true;

    const subs = column.subColumns ?? [];
    // Normalize widths to sum to 100%.
    const sumRaw = subs.reduce((a, s) => a + (s.width || 0), 0) || 100;
    const widths = subs.map((s) => Math.round(((s.width || 0) / sumRaw) * 10000) / 100);

    const cells = subs.map((sc, i) => {
      const inner = (sc.blocks ?? []).map((b: any) => blockToRawHtml(b)).join('\n');
      const valign = sc.verticalAlign ?? 'top';
      const hasPadding = sc.paddingTop || sc.paddingRight || sc.paddingBottom || sc.paddingLeft;
      const padding = hasPadding
        ? `padding:${sc.paddingTop || '0'} ${sc.paddingRight || '0'} ${sc.paddingBottom || '0'} ${sc.paddingLeft || '0'};`
        : 'padding:10px;';
      const bg = sc.backgroundColor ? `background-color:${sc.backgroundColor};` : '';
      return `<td class="ee-sub-col" width="${widths[i]}%" valign="${valign}" style="${padding}${bg}">${inner}</td>`;
    }).join('');

    // Reuse the standard column attribute path so width / bg / padding still apply on the parent column.
    const colAttrs: string[] = [`css-class="el-column el-${column.id}"`];
    if (column.width) colAttrs.push(`width="${column.width}%"`);
    if (column.backgroundColor) colAttrs.push(`background-color="${column.backgroundColor}"`);
    if (column.verticalAlign) colAttrs.push(`vertical-align="${column.verticalAlign}"`);
    if (column.padding) {
      const padding = spacingToString(column.padding);
      if (padding) colAttrs.push(`padding="${padding}"`);
    }

    return `
<mj-column ${colAttrs.join(' ')}>
  <mj-raw>
    <table role="presentation" class="ee-sub-cols" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>${cells}</tr>
    </table>
  </mj-raw>
</mj-column>
    `.trim();
  }

  /**
   * Convert block to MJML based on type
   */
  private blockToMJML(block: Block): string {
    // Skip hidden blocks
    if (block.hidden) return '';

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
      case 'social':
        return this.socialBlockToMJML(block);
      case 'hero':
        return this.heroBlockToMJML(block);
      case 'accordion':
        return this.accordionBlockToMJML(block);
      case 'raw':
        return this.rawBlockToMJML(block);
      case 'navbar':
        return this.navbarBlockToMJML(block);
      case 'carousel':
        return this.carouselBlockToMJML(block);
      case 'table':
        return this.tableBlockToMJML(block);
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
   *
   * Note: MJML applies styles to the container <td>, but TipTap content
   * (wrapped in <p> tags) doesn't inherit these styles. We solve this by
   * wrapping the content in a <div> with explicit inline styles.
   */
  private textBlockToMJML(block: TextBlock): string {
    const attrs: string[] = [];
    const inlineStyles: string[] = [];

    // Build both MJML attributes AND inline styles for the content wrapper
    if (block.align) {
      attrs.push(`align="${block.align}"`);
      inlineStyles.push(`text-align:${block.align}`);
    }
    if (block.color) {
      attrs.push(`color="${block.color}"`);
      inlineStyles.push(`color:${block.color}`);
    }
    if (block.fontSize) {
      attrs.push(`font-size="${block.fontSize}"`);
      inlineStyles.push(`font-size:${block.fontSize}`);
    }
    if (block.fontFamily) {
      attrs.push(`font-family="${block.fontFamily}"`);
      inlineStyles.push(`font-family:${block.fontFamily}`);
    }
    if (block.lineHeight) {
      attrs.push(`line-height="${block.lineHeight}"`);
      inlineStyles.push(`line-height:${block.lineHeight}`);
    }
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    // Wrap content in a div with inline styles to ensure they apply to nested elements
    const styledContent = inlineStyles.length > 0
      ? `<div style="${inlineStyles.join(';')}">${block.content}</div>`
      : block.content;

    return `<mj-text ${attrs.join(' ')} css-class="el-text el-${block.id}">${styledContent}</mj-text>`;
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
    if (block.borderRadius) attrs.push(`border-radius="${block.borderRadius}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-image ${attrs.join(' ')} css-class="el-image el-${block.id}" />`;
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
    if (block.border) attrs.push(`border="${block.border}"`);
    if (block.innerPadding) attrs.push(`inner-padding="${block.innerPadding}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-button ${attrs.join(' ')} css-class="el-button el-${block.id}">${block.label}</mj-button>`;
  }

  /**
   * Convert divider block to MJML
   */
  private dividerBlockToMJML(block: DividerBlock): string {
    const attrs: string[] = [];

    if (block.borderColor) attrs.push(`border-color="${block.borderColor}"`);
    if (block.borderWidth) attrs.push(`border-width="${block.borderWidth}"`);
    if (block.borderStyle) attrs.push(`border-style="${block.borderStyle}"`);
    if (block.width) attrs.push(`width="${block.width}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    return `<mj-divider ${attrs.join(' ')} css-class="el-divider el-${block.id}" />`;
  }

  /**
   * Convert spacer block to MJML
   */
  private spacerBlockToMJML(block: SpacerBlock): string {
    return `<mj-spacer height="${block.height}" css-class="el-spacer el-${block.id}" />`;
  }

  /**
   * Platform brand colors for social icons
   */
  private readonly SOCIAL_COLORS: Record<string, string> = {
    facebook: '#1877F2',
    twitter: '#000000',
    instagram: '#E4405F',
    linkedin: '#0A66C2',
    youtube: '#FF0000',
    pinterest: '#BD081C',
    github: '#181717',
  };

  /**
   * Get white SVG icon as data URI for a platform
   * Uses clean, minimal SVGs optimized for email
   */
  private getSocialIconDataUri(platform: string): string {
    // Clean white SVG icons (viewBox 0 0 24 24, fill white)
    const svgIcons: Record<string, string> = {
      facebook: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
      twitter: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
      instagram: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 0C8.74 0 8.333.015 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.74 0 12s.015 3.667.072 4.947c.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.74 24 12 24s3.667-.015 4.947-.072c4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
      linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
      youtube: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
      pinterest: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345c-.091.378-.293 1.194-.333 1.361-.052.218-.174.265-.402.159-1.495-.696-2.428-2.882-2.428-4.64 0-3.779 2.744-7.253 7.917-7.253 4.158 0 7.389 2.963 7.389 6.923 0 4.13-2.607 7.461-6.229 7.461-1.217 0-2.36-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>',
      github: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
    };
    // Encode SVG to base64 data URI
    const svg = svgIcons[platform] || svgIcons.facebook;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  /**
   * Convert social block to MJML using raw HTML table for reliable horizontal layout
   * Uses styled anchor tags with background colors for full width control
   */
  private socialBlockToMJML(block: SocialBlock): string {
    const iconSize = block.iconSize || '40px';
    const iconPadding = block.iconPadding || '8px';
    const borderRadius = block.borderRadius || '999px';
    const align = block.align || 'center';
    const isVertical = block.mode === 'vertical';

    // Calculate inner icon size (50% of button size for good proportions)
    const sizeNum = parseInt(iconSize, 10) || 40;
    const innerIconSize = Math.round(sizeNum * 0.5);
    const paddingNum = parseInt(iconPadding, 10) || 8;

    // Get color for a link - use per-link color if set, otherwise platform default
    const getLinkColor = (link: SocialLink): string => {
      return link.color || this.SOCIAL_COLORS[link.platform] || '#666666';
    };

    // For vertical mode, output stacked buttons
    if (isVertical) {
      const verticalButtons = block.links
        .map((link: SocialLink) => {
          const bgColor = getLinkColor(link);
          const iconUrl = this.getSocialIconDataUri(link.platform);

          return `<mj-button
    href="${link.url}"
    background-color="${bgColor}"
    border-radius="${borderRadius}"
    width="${iconSize}"
    height="${iconSize}"
    padding="${iconPadding} 0"
    inner-padding="0"
    align="${align}"
    css-class="el-social-btn el-${block.id}-${link.platform}"
  ><img src="${iconUrl}" alt="${link.platform}" width="${innerIconSize}" height="${innerIconSize}" style="display:block;margin:auto;" /></mj-button>`;
        })
        .join('\n');

      return `<!-- Social Icons (vertical) -->
${verticalButtons}`;
    }

    // For horizontal mode, use raw HTML table with align attribute (works in Outlook)
    // Margin provides fallback for modern email clients
    const alignMargin = align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0 auto 0 0';
    
    const socialCells = block.links
      .map((link: SocialLink, index: number) => {
        const bgColor = getLinkColor(link);
        const iconUrl = this.getSocialIconDataUri(link.platform);
        const isLast = index === block.links.length - 1;
        const cellPadding = isLast ? '0' : `0 ${paddingNum}px 0 0`;
        // Center the icon vertically and horizontally within the circle
        const paddingForCentering = Math.round((sizeNum - innerIconSize) / 2);

        return `<td style="padding: ${cellPadding};">
          <a href="${link.url}" target="_blank" style="display: block; width: ${iconSize}; height: ${iconSize}; background-color: ${bgColor}; border-radius: ${borderRadius}; text-decoration: none;">
            <img src="${iconUrl}" alt="${link.platform}" width="${innerIconSize}" height="${innerIconSize}" style="display: block; margin: ${paddingForCentering}px auto 0 auto;" />
          </a>
        </td>`;
      })
      .join('\n        ');

    // Use table align attribute (Outlook) + margin (modern clients) for reliable alignment
    return `<!-- Social Icons (horizontal) -->
<mj-raw>
  <table align="${align}" role="presentation" cellpadding="0" cellspacing="0" style="margin: ${alignMargin};">
    <tr>
      ${socialCells}
    </tr>
  </table>
</mj-raw>`;
  }

  /**
   * Convert hero block to MJML
   */
  private heroBlockToMJML(block: HeroBlock): string {
    const attrs: string[] = [
      `background-url="${block.backgroundImage}"`,
      `css-class="el-hero el-${block.id}"`,
    ];

    if (block.backgroundHeight) attrs.push(`background-height="${block.backgroundHeight}"`);
    if (block.backgroundWidth) attrs.push(`background-width="${block.backgroundWidth}"`);
    if (block.backgroundColor) attrs.push(`background-color="${block.backgroundColor}"`);
    if (block.verticalAlign) attrs.push(`vertical-align="${block.verticalAlign}"`);
    if (block.mode) attrs.push(`mode="${block.mode}"`);

    return `
<mj-hero ${attrs.join(' ')}>
  <mj-text align="center" color="#ffffff" font-size="32px" font-weight="bold">
    Hero Title
  </mj-text>
  <mj-text align="center" color="#ffffff" font-size="16px">
    Add your hero content here
  </mj-text>
  <mj-button href="#" background-color="#ffffff" color="#944923">
    Call to Action
  </mj-button>
</mj-hero>
    `.trim();
  }

  /**
   * Convert accordion block to MJML
   */
  private accordionBlockToMJML(block: AccordionBlock): string {
    const attrs: string[] = [`css-class="el-accordion el-${block.id}"`];

    if (block.iconPosition) attrs.push(`icon-position="${block.iconPosition}"`);
    if (block.borderColor) attrs.push(`border="${block.borderColor}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);

    const items = block.items
      .map(
        (item: AccordionItem) => `
  <mj-accordion-element>
    <mj-accordion-title>${item.title}</mj-accordion-title>
    <mj-accordion-text>${item.content}</mj-accordion-text>
  </mj-accordion-element>`
      )
      .join('\n');

    return `
<mj-accordion ${attrs.join(' ')}>
${items}
</mj-accordion>
    `.trim();
  }

  /**
   * Convert raw HTML block to MJML
   */
  private rawBlockToMJML(block: RawBlock): string {
    return `<mj-raw css-class="el-raw el-${block.id}">${block.html}</mj-raw>`;
  }

  /**
   * Convert navbar block to MJML
   */
  private navbarBlockToMJML(block: NavbarBlock): string {
    const attrs: string[] = [`css-class="el-navbar el-${block.id}"`];

    if (block.hamburger) attrs.push('hamburger="hamburger"');
    if (block.baseUrl) attrs.push(`base-url="${block.baseUrl}"`);
    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.icoColor) attrs.push(`ico-color="${block.icoColor}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const links = block.links
      .map((link: NavbarLink) => {
        const linkAttrs: string[] = [`href="${link.href}"`];
        if (link.color) linkAttrs.push(`color="${link.color}"`);
        return `  <mj-navbar-link ${linkAttrs.join(' ')}>${link.label}</mj-navbar-link>`;
      })
      .join('\n');

    return `
<mj-navbar ${attrs.join(' ')}>
${links}
</mj-navbar>
    `.trim();
  }

  /**
   * Convert carousel block to MJML
   */
  private carouselBlockToMJML(block: CarouselBlock): string {
    const attrs: string[] = [`css-class="el-carousel el-${block.id}"`];

    if (block.thumbnails) attrs.push(`thumbnails="${block.thumbnails}"`);
    if (block.borderRadius) attrs.push(`border-radius="${block.borderRadius}"`);
    if (block.iconWidth) attrs.push(`icon-width="${block.iconWidth}"`);
    if (block.tbBorderRadius) attrs.push(`tb-border-radius="${block.tbBorderRadius}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const images = block.images
      .map((img: CarouselImage) => {
        const imgAttrs: string[] = [`src="${img.src}"`];
        if (img.alt) imgAttrs.push(`alt="${img.alt}"`);
        if (img.href) imgAttrs.push(`href="${img.href}"`);
        if (img.thumbnailSrc) imgAttrs.push(`thumbnails-src="${img.thumbnailSrc}"`);
        return `  <mj-carousel-image ${imgAttrs.join(' ')} />`;
      })
      .join('\n');

    return `
<mj-carousel ${attrs.join(' ')}>
${images}
</mj-carousel>
    `.trim();
  }

  /**
   * Convert table block to MJML
   */
  private tableBlockToMJML(block: TableBlock): string {
    const attrs: string[] = [`css-class="el-table el-${block.id}"`];

    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.color) attrs.push(`color="${block.color}"`);
    if (block.fontFamily) attrs.push(`font-family="${block.fontFamily}"`);
    if (block.fontSize) attrs.push(`font-size="${block.fontSize}"`);
    if (block.cellpadding) attrs.push(`cellpadding="${block.cellpadding}"`);
    if (block.cellspacing) attrs.push(`cellspacing="${block.cellspacing}"`);
    if (block.border) attrs.push(`border="${block.border}"`);
    if (block.padding) {
      const padding = spacingToString(block.padding);
      if (padding) attrs.push(`padding="${padding}"`);
    }

    // Generate header row
    const headerCells = block.headers
      .map((h: string) => `<th style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${h}</th>`)
      .join('');
    const headerRow = `<tr style="background-color: #f5f5f5;">${headerCells}</tr>`;

    // Generate data rows
    const dataRows = block.rows
      .map((row: string[]) => {
        const cells = row
          .map((cell: string) => `<td style="padding: 8px; border-bottom: 1px solid #eee;">${cell}</td>`)
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('\n');

    return `
<mj-table ${attrs.join(' ')}>
${headerRow}
${dataRows}
</mj-table>
    `.trim();
  }

  /**
   * Generate branded header block
   */
  private headerBlockToMJML(): string {
    return `
<mj-wrapper background-color="#ffffff" padding="20px" css-class="el-header-wrapper">
  <mj-section css-class="el-header-section">
    <mj-column css-class="el-header-column">
      <mj-image src="https://placeholder.com/70x70" width="70px" align="center" css-class="el-header-image" />
      <mj-text align="center" font-size="24px" color="#944923" font-family="Georgia, serif" css-class="el-header-text">
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
<mj-wrapper background-color="#f5f5f5" padding="20px" css-class="el-footer-wrapper">
  <mj-section css-class="el-footer-section">
    <mj-column css-class="el-footer-column">
      <mj-text align="center" font-size="12px" color="#666666" css-class="el-footer-text-1">
        © ${new Date().getFullYear()} ReTurn Hypnosis. All rights reserved.
      </mj-text>
      <mj-text align="center" font-size="12px" color="#666666" css-class="el-footer-text-2">
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

