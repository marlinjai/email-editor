// packages/ui/src/renderer/blocks/NavbarBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface NavbarBlockProps {
  block: BlockInstance;
}

export const NavbarBlock = observer(({ block }: NavbarBlockProps) => {
  if (block.navLinks.length === 0) {
    return (
      <div className="navbar-block" style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
        No navigation links
      </div>
    );
  }

  return (
    <nav
      className="navbar-block"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center',
        gap: '16px',
        padding: '12px 16px',
        ...(block.computedStyle as React.CSSProperties),
      }}
    >
      {block.hamburger && (
        <span style={{ fontSize: '18px', color: block.icoColor || '#333', cursor: 'pointer' }}>
          &#9776;
        </span>
      )}
      {block.navLinks.map((link, i) => (
        <span
          key={i}
          style={{
            color: link.color || block.color || '#333',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          {link.label}
        </span>
      ))}
    </nav>
  );
});

NavbarBlock.displayName = 'NavbarBlock';
