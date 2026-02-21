// packages/blocks/src/social/index.ts
// Social icons block - renders as buttons with icon images for reliable sizing

import type { BlockDefinition, SocialBlock, SocialLink } from '@marlinjai/email-editor-core';
import { SocialBlockSchema } from '@marlinjai/email-editor-core';

/**
 * Platform brand colors for social icons (exported for UI use)
 */
export const SOCIAL_COLORS: Record<string, string> = {
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
function getSocialIconDataUri(platform: string): string {
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
 * Social icons block definition
 * Renders as buttons with icon images instead of mj-social for reliable sizing
 */
export const socialBlockDefinition: BlockDefinition<SocialBlock> = {
  type: 'social',
  label: 'Social Icons',
  category: 'media',
  description: 'Social media links',
  defaultProps: {
    mode: 'horizontal',
    align: 'center',
    iconSize: '40px',
    iconPadding: '8px',
    borderRadius: '999px', // Round icons by default
    links: [
      { platform: 'facebook', url: 'https://facebook.com' },
      { platform: 'instagram', url: 'https://instagram.com' },
      { platform: 'linkedin', url: 'https://linkedin.com' },
    ],
  },
  propSchema: SocialBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const iconSize = block.iconSize || '40px';
    const iconPadding = block.iconPadding || '8px';
    const borderRadius = block.borderRadius || '999px';
    const align = block.align || 'center';
    const isVertical = block.mode === 'vertical';

    // Calculate inner icon size (50% of button size)
    const sizeNum = parseInt(iconSize, 10) || 40;
    const innerIconSize = Math.round(sizeNum * 0.5);
    const paddingNum = parseInt(iconPadding, 10) || 8;

    // Get color for a link - use per-link color if set, otherwise platform default
    const getLinkColor = (link: SocialLink): string => {
      return link.color || SOCIAL_COLORS[link.platform] || '#666666';
    };

    // For vertical mode, output stacked buttons
    if (isVertical) {
      return block.links
        .map((link) => {
          const bgColor = getLinkColor(link);
          const iconUrl = getSocialIconDataUri(link.platform);

          return `<mj-button href="${link.url}" background-color="${bgColor}" border-radius="${borderRadius}" width="${iconSize}" height="${iconSize}" padding="${iconPadding} 0" inner-padding="0" align="${align}" css-class="el-social-btn el-${block.id}-${link.platform}"><img src="${iconUrl}" alt="${link.platform}" width="${innerIconSize}" height="${innerIconSize}" style="display:block;margin:auto;" /></mj-button>`;
        })
        .join('\n');
    }

    // For horizontal mode, use raw HTML table with align attribute (Outlook) + margin (modern clients)
    const alignMargin = align === 'center' ? '0 auto' : align === 'right' ? '0 0 0 auto' : '0 auto 0 0';
    
    const socialCells = block.links
      .map((link, index) => {
        const bgColor = getLinkColor(link);
        const iconUrl = getSocialIconDataUri(link.platform);
        const isLast = index === block.links.length - 1;
        const cellPadding = isLast ? '0' : `0 ${paddingNum}px 0 0`;
        const paddingForCentering = Math.round((sizeNum - innerIconSize) / 2);

        return `<td style="padding: ${cellPadding};"><a href="${link.url}" target="_blank" style="display: block; width: ${iconSize}; height: ${iconSize}; background-color: ${bgColor}; border-radius: ${borderRadius}; text-decoration: none;"><img src="${iconUrl}" alt="${link.platform}" width="${innerIconSize}" height="${innerIconSize}" style="display: block; margin: ${paddingForCentering}px auto 0 auto;" /></a></td>`;
      })
      .join('');

    return `<mj-raw><table align="${align}" role="presentation" cellpadding="0" cellspacing="0" style="margin: ${alignMargin};"><tr>${socialCells}</tr></table></mj-raw>`;
  },
};

