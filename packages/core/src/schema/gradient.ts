export interface GradientStop {
  color: string;     // CSS color string, e.g. "#ff0000" or "rgba(255,0,0,0.5)"
  position: number;  // 0-100 percentage
}

export interface BackgroundGradient {
  type: 'linear' | 'radial';
  angle: number;     // degrees — only used when type === 'linear', ignored for radial
  stops: GradientStop[];
}

/**
 * Converts a BackgroundGradient to a CSS background-image value.
 * Returns undefined when stops array is empty.
 *
 * Examples:
 *   buildGradientCSS({ type: 'linear', angle: 90, stops: [{color:'#f00',position:0},{color:'#00f',position:100}] })
 *   // => "linear-gradient(90deg, #f00 0%, #00f 100%)"
 *
 *   buildGradientCSS({ type: 'radial', angle: 0, stops: [{color:'#f00',position:0},{color:'#00f',position:100}] })
 *   // => "radial-gradient(circle, #f00 0%, #00f 100%)"
 */
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
