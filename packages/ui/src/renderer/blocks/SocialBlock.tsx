// packages/ui/src/renderer/blocks/SocialBlock.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@marlinjai/email-editor-core';

interface SocialBlockProps {
  block: BlockInstance;
}

// Simple SVG icons for common social platforms
const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M18.77 7.46H14.5v-1.9c0-.9.6-1.1 1-1.1h3V.5h-4.33C10.24.5 9.5 3.44 9.5 5.32v2.15h-3v4h3v12h5v-12h3.85l.42-4z"/>
    </svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M23.44 4.83c-.8.37-1.5.38-2.22.02.93-.56.98-.96 1.32-2.02-.88.52-1.86.9-2.9 1.1-.82-.88-2-1.43-3.3-1.43-2.5 0-4.55 2.04-4.55 4.54 0 .36.03.7.1 1.04-3.77-.2-7.12-2-9.36-4.75-.4.67-.6 1.45-.6 2.3 0 1.56.8 2.95 2 3.77-.74-.03-1.44-.23-2.05-.57v.06c0 2.2 1.56 4.03 3.64 4.44-.67.2-1.37.2-2.06.08.58 1.8 2.26 3.12 4.25 3.16C5.78 18.1 3.37 18.74 1 18.46c2 1.3 4.4 2.04 6.97 2.04 8.35 0 12.92-6.92 12.92-12.93 0-.2 0-.4-.02-.6.9-.63 1.96-1.22 2.56-2.14z"/>
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.03-1.85-3.03-1.85 0-2.13 1.45-2.13 2.94v5.66H9.37V9h3.4v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.3zM5.34 7.43c-1.14 0-2.07-.93-2.07-2.07 0-1.15.93-2.07 2.07-2.07 1.15 0 2.07.92 2.07 2.07 0 1.14-.92 2.07-2.07 2.07zm1.77 13.02H3.56V9h3.55v11.45z"/>
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.7 4.92 4.92.06 1.27.07 1.65.07 4.85 0 3.2-.01 3.58-.07 4.85-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07-3.2 0-3.58-.01-4.85-.07-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85 0-3.2.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.7.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98 1.28.06 1.7.07 4.95.07s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.7.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zM12 16a4 4 0 110-8 4 4 0 010 8zm6.4-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M23.5 6.5c-.3-1-1-1.8-2-2.1C19.7 4 12 4 12 4s-7.7 0-9.5.4c-1 .3-1.8 1-2 2.1C0 8.3 0 12 0 12s0 3.7.5 5.5c.3 1 1 1.8 2 2.1 1.8.4 9.5.4 9.5.4s7.7 0 9.5-.4c1-.3 1.8-1 2-2.1.5-1.8.5-5.5.5-5.5s0-3.7-.5-5.5zM9.5 15.5v-7l6.3 3.5-6.3 3.5z"/>
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.4 1.9 1.4 3.2 0 4.6-2.8 5.6-5.5 6 .5.4.9 1.2.9 2.4v3.5c0 .3.2.7.8.6A12 12 0 0012 .3"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="100%" height="100%">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
};

// Default colors for social platforms
const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  twitter: '#1DA1F2',
  linkedin: '#0A66C2',
  instagram: '#E4405F',
  youtube: '#FF0000',
  github: '#181717',
  x: '#000000',
};

/**
 * SocialBlock - Renders social media icons in the email preview
 */
export const SocialBlock = observer(({ block }: SocialBlockProps) => {
  const containerStyle: React.CSSProperties = {
    textAlign: (block.align as React.CSSProperties['textAlign']) || 'center',
    paddingTop: block.paddingTop || undefined,
    paddingRight: block.paddingRight || undefined,
    paddingBottom: block.paddingBottom || undefined,
    paddingLeft: block.paddingLeft || undefined,
  };

  const listStyle: React.CSSProperties = {
    display: block.mode === 'vertical' ? 'flex' : 'inline-flex',
    flexDirection: block.mode === 'vertical' ? 'column' : 'row',
    alignItems: 'center',
    gap: block.iconPadding || '8px',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  };

  const iconSize = block.iconSize || '32px';

  // If no links, show placeholder
  if (!block.links || block.links.length === 0) {
    return (
      <div className="social-block" style={containerStyle}>
        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
          Add social links...
        </div>
      </div>
    );
  }

  return (
    <div className="social-block" style={containerStyle}>
      <ul style={listStyle}>
        {block.links.map((link, index) => {
          const platform = link.platform.toLowerCase();
          const color = link.color || PLATFORM_COLORS[platform] || '#6b7280';
          const icon = SOCIAL_ICONS[platform];

          return (
            <li key={index}>
              <a
                href={link.url}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: iconSize,
                  height: iconSize,
                  color: color,
                  backgroundColor: 'transparent',
                  borderRadius: block.borderRadius || '4px',
                  textDecoration: 'none',
                }}
                onClick={(e) => e.preventDefault()}
                title={link.platform}
              >
                {icon || (
                  <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                    {platform.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

SocialBlock.displayName = 'SocialBlock';
