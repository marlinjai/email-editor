// packages/blocks/src/navbar/index.ts
// Navbar block for navigation menus
// Maps to MJML's <mj-navbar> component

import type { BlockDefinition, NavbarBlock } from '@returnhypnosis/email-editor-core';
import { NavbarBlockSchema } from '@returnhypnosis/email-editor-core';

/**
 * Navbar block definition
 * Creates a responsive navigation menu with optional hamburger mode
 */
export const navbarBlockDefinition: BlockDefinition<NavbarBlock> = {
  type: 'navbar',
  label: 'Navigation',
  category: 'layout',
  description: 'Navigation menu with links',
  defaultProps: {
    links: [
      { label: 'Home', href: '#' },
      { label: 'About', href: '#' },
      { label: 'Contact', href: '#' },
    ],
    hamburger: true,
    align: 'center',
  },
  propSchema: NavbarBlockSchema.omit({ id: true, type: true }),
  toMJML: (block) => {
    const attrs: string[] = [`css-class="el-navbar el-${block.id}"`];

    if (block.hamburger) attrs.push('hamburger="hamburger"');
    if (block.baseUrl) attrs.push(`base-url="${block.baseUrl}"`);
    if (block.align) attrs.push(`align="${block.align}"`);
    if (block.icoColor) attrs.push(`ico-color="${block.icoColor}"`);
    if (block.padding) {
      const padding = [
        block.padding.top,
        block.padding.right,
        block.padding.bottom,
        block.padding.left,
      ]
        .filter(Boolean)
        .join(' ');
      if (padding) attrs.push(`padding="${padding}"`);
    }

    const links = block.links
      .map((link) => {
        const linkAttrs: string[] = [`href="${link.href}"`];
        if (link.color) linkAttrs.push(`color="${link.color}"`);
        return `<mj-navbar-link ${linkAttrs.join(' ')}>${link.label}</mj-navbar-link>`;
      })
      .join('\n    ');

    return `
<mj-navbar ${attrs.join(' ')}>
    ${links}
</mj-navbar>
    `.trim();
  },
};

