// packages/editor/src/theme.ts
// Map the public EditorTheme onto the editor's CSS design tokens

import type { CSSProperties } from 'react';
import type { EditorTheme } from './types';

/**
 * CSS custom properties for the editor's root element. Returns an empty
 * object when there is no theme, so the stylesheet defaults apply.
 */
export function themeToStyle(theme: EditorTheme | undefined): CSSProperties {
  const style: Record<string, string> = {};
  const set = (token: string, value: string | undefined) => {
    if (typeof value === 'string' && value.trim()) style[token] = value.trim();
  };
  set('--ee-accent', theme?.colors?.primary);
  set('--ee-accent-hover', theme?.colors?.primaryHover ?? theme?.colors?.primary);
  set('--ee-canvas-2', theme?.colors?.surface);
  set('--ee-text-dark', theme?.colors?.text);
  set('--ee-border-light', theme?.colors?.border);
  set('--ee-font-sans', theme?.fonts?.body);
  return style as CSSProperties;
}
