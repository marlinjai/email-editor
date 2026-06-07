import { describe, it, expect } from 'vitest';
import { buildGradientCSS } from '../gradient';
import type { BackgroundGradient } from '../gradient';

describe('buildGradientCSS', () => {
  it('returns undefined for empty stops', () => {
    const g: BackgroundGradient = { type: 'linear', angle: 90, stops: [] };
    expect(buildGradientCSS(g)).toBeUndefined();
  });

  it('builds a linear gradient', () => {
    const g: BackgroundGradient = {
      type: 'linear',
      angle: 90,
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 100 },
      ],
    };
    expect(buildGradientCSS(g)).toBe('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  it('builds a radial gradient (ignores angle)', () => {
    const g: BackgroundGradient = {
      type: 'radial',
      angle: 45,
      stops: [
        { color: '#ffffff', position: 0 },
        { color: '#000000', position: 100 },
      ],
    };
    expect(buildGradientCSS(g)).toBe('radial-gradient(circle, #ffffff 0%, #000000 100%)');
  });

  it('handles multiple stops', () => {
    const g: BackgroundGradient = {
      type: 'linear',
      angle: 180,
      stops: [
        { color: '#f00', position: 0 },
        { color: '#0f0', position: 50 },
        { color: '#00f', position: 100 },
      ],
    };
    expect(buildGradientCSS(g)).toBe('linear-gradient(180deg, #f00 0%, #0f0 50%, #00f 100%)');
  });
});
