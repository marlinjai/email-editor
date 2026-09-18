import { describe, it, expect } from 'vitest';
import { themeToStyle } from '../theme';

describe('themeToStyle', () => {
  it('returns no tokens without a theme, so the stylesheet defaults apply', () => {
    expect(themeToStyle(undefined)).toEqual({});
    expect(themeToStyle({})).toEqual({});
  });

  it('maps each theme value onto its design token', () => {
    expect(
      themeToStyle({
        colors: { primary: '#0f766e', primaryHover: '#115e59', surface: '#fff', text: '#111', border: '#ddd' },
        fonts: { body: 'Inter, sans-serif' },
      })
    ).toEqual({
      '--ee-accent': '#0f766e',
      '--ee-accent-hover': '#115e59',
      '--ee-canvas-2': '#fff',
      '--ee-text-dark': '#111',
      '--ee-border-light': '#ddd',
      '--ee-font-sans': 'Inter, sans-serif',
    });
  });

  it('uses the primary color for hover when no hover color is given', () => {
    expect(themeToStyle({ colors: { primary: '#0f766e' } })).toEqual({
      '--ee-accent': '#0f766e',
      '--ee-accent-hover': '#0f766e',
    });
  });

  it('ignores empty values instead of blanking a token', () => {
    expect(themeToStyle({ colors: { primary: '  ', text: '' } })).toEqual({});
  });
});
