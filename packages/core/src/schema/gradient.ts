export interface GradientStop {
  color: string;
  position: number; // 0-100 percentage
}

export interface BackgroundGradient {
  type: 'linear' | 'radial';
  angle: number; // degrees — only used when type === 'linear'
  stops: GradientStop[];
}

export function buildGradientCSS(gradient: BackgroundGradient): string | undefined {
  if (gradient.stops.length === 0) return undefined;

  const stopList = gradient.stops
    .map((s) => `${s.color} ${s.position}%`)
    .join(', ');

  if (gradient.type === 'radial') {
    return `radial-gradient(circle, ${stopList})`;
  }
  return `linear-gradient(${gradient.angle}deg, ${stopList})`;
}
