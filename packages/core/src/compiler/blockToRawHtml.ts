// packages/core/src/compiler/blockToRawHtml.ts
// Inline-HTML emitters for leaf blocks rendered inside the <mj-raw>
// nested-table island used for sub-columns. Output targets the 85-90%
// email-client tier (Apple Mail + Gmail + modern Outlook).

import { BlockType } from '../store/mst/models/BlockModel';
import { isLeafBlockType } from '../registry/blockCategories';
import type {
  Block, TextBlock, ImageBlock, ButtonBlock, DividerBlock,
  SpacerBlock, SocialBlock, SocialLink,
} from '../schema/types';

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function spacingToCss(p?: { top?: string; right?: string; bottom?: string; left?: string }): string {
  if (!p) return '';
  const t = p.top ?? '0', r = p.right ?? '0', b = p.bottom ?? '0', l = p.left ?? '0';
  return `padding:${t} ${r} ${b} ${l};`;
}

function textToHtml(b: TextBlock): string {
  const styles: string[] = [];
  if (b.color) styles.push(`color:${b.color}`);
  if (b.fontSize) styles.push(`font-size:${b.fontSize}`);
  if (b.fontFamily) styles.push(`font-family:${b.fontFamily}`);
  if (b.lineHeight) styles.push(`line-height:${b.lineHeight}`);
  if (b.align) styles.push(`text-align:${b.align}`);
  styles.push('margin:0');
  const padding = spacingToCss(b.padding);
  return `<div style="${styles.join(';')};${padding}">${b.content}</div>`;
}

function imageToHtml(b: ImageBlock): string {
  const align = b.align ?? 'center';
  const wrap = `style="text-align:${align};${spacingToCss(b.padding)}"`;
  const widthAttr = b.width ? ` width="${escapeAttr(b.width)}"` : '';
  const heightAttr = b.height ? ` height="${escapeAttr(b.height)}"` : '';
  const radius = b.borderRadius ? `border-radius:${b.borderRadius};` : '';
  const img = `<img src="${escapeAttr(b.src)}" alt="${escapeAttr(b.alt ?? '')}"${widthAttr}${heightAttr} style="display:block;max-width:100%;${radius}border:0;outline:none;text-decoration:none;" />`;
  const inner = b.href
    ? `<a href="${escapeAttr(b.href)}" target="_blank" rel="noopener" style="text-decoration:none;">${img}</a>`
    : img;
  return `<div ${wrap}>${inner}</div>`;
}

function buttonToHtml(b: ButtonBlock): string {
  const align = b.align ?? 'center';
  const bg = b.backgroundColor ?? '#000000';
  const fg = b.color ?? '#ffffff';
  const radius = b.borderRadius ?? '3px';
  const innerPadding = b.innerPadding ?? '10px 25px';
  const border = b.border ? `border:${b.border};` : '';
  return `<div style="text-align:${align};${spacingToCss(b.padding)}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;line-height:100%;display:inline-block;">
      <tr>
        <td align="center" valign="middle" role="presentation" style="background-color:${bg};border-radius:${radius};${border}padding:${innerPadding};">
          <a href="${escapeAttr(b.href)}" target="_blank" rel="noopener" style="display:inline-block;color:${fg};font-family:inherit;font-size:14px;font-weight:600;line-height:120%;text-decoration:none;text-transform:none;">${escapeAttr(b.label)}</a>
        </td>
      </tr>
    </table>
  </div>`;
}

function dividerToHtml(b: DividerBlock): string {
  const color = b.borderColor ?? '#cccccc';
  const w = b.borderWidth ?? '1px';
  const style = b.borderStyle ?? 'solid';
  const width = b.width ?? '100%';
  return `<div style="${spacingToCss(b.padding)}">
    <div style="border-top:${w} ${style} ${color};width:${width};font-size:1px;line-height:1px;">&nbsp;</div>
  </div>`;
}

function spacerToHtml(b: SpacerBlock): string {
  return `<div style="height:${b.height};line-height:${b.height};font-size:1px;">&nbsp;</div>`;
}

function socialToHtml(b: SocialBlock): string {
  const items = (b.links ?? []).map((link: SocialLink) => {
    const icon = (link as any).icon ?? '';
    return `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener" style="display:inline-block;margin:0 4px;">
      <img src="${escapeAttr(icon)}" alt="${escapeAttr(link.platform)}" width="24" height="24" style="display:inline-block;border:0;" />
    </a>`;
  }).join('');
  return `<div style="text-align:center;">${items}</div>`;
}

export function blockToRawHtml(block: Block): string {
  if (!isLeafBlockType(block.type as BlockType)) {
    throw new Error(`blockToRawHtml only handles leaf blocks; got "${block.type}"`);
  }
  switch (block.type) {
    case BlockType.TEXT:    return textToHtml(block as TextBlock);
    case BlockType.IMAGE:   return imageToHtml(block as ImageBlock);
    case BlockType.BUTTON:  return buttonToHtml(block as ButtonBlock);
    case BlockType.DIVIDER: return dividerToHtml(block as DividerBlock);
    case BlockType.SPACER:  return spacerToHtml(block as SpacerBlock);
    case BlockType.SOCIAL:  return socialToHtml(block as SocialBlock);
    default:
      throw new Error(`Unhandled leaf block type: ${(block as any).type}`);
  }
}
