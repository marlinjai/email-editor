import type { LinkClickStats } from './types';

export interface HeatmapLink {
  url: string;
  totalClicks: number;
  uniqueClicks: number;
  percentage: number;
  intensity: HeatmapIntensity;
}

export type HeatmapIntensity = 'cold' | 'warm' | 'hot' | 'very_hot';

/**
 * Generate heatmap data from link click stats.
 * Each link gets a percentage and intensity rating.
 */
export function generateHeatmapData(linkStats: LinkClickStats[]): HeatmapLink[] {
  if (linkStats.length === 0) return [];

  const totalAllClicks = linkStats.reduce((sum, l) => sum + l.totalClicks, 0);
  const maxClicks = Math.max(...linkStats.map((l) => l.totalClicks));

  return linkStats.map((link) => ({
    url: link.url,
    totalClicks: link.totalClicks,
    uniqueClicks: link.uniqueClicks,
    percentage: totalAllClicks > 0 ? (link.totalClicks / totalAllClicks) * 100 : 0,
    intensity: getIntensity(link.totalClicks, maxClicks),
  }));
}

function getIntensity(clicks: number, maxClicks: number): HeatmapIntensity {
  if (maxClicks === 0) return 'cold';
  const ratio = clicks / maxClicks;
  if (ratio >= 0.75) return 'very_hot';
  if (ratio >= 0.5) return 'hot';
  if (ratio >= 0.25) return 'warm';
  return 'cold';
}

/**
 * Inject heatmap overlay annotations into email HTML.
 * Adds data attributes and highlight styles to tracked links.
 */
export function injectHeatmapOverlay(
  html: string,
  heatmapLinks: HeatmapLink[],
): string {
  const INTENSITY_COLORS: Record<HeatmapIntensity, string> = {
    cold: 'rgba(59, 130, 246, 0.2)',
    warm: 'rgba(234, 179, 8, 0.3)',
    hot: 'rgba(249, 115, 22, 0.4)',
    very_hot: 'rgba(239, 68, 68, 0.5)',
  };

  let result = html;

  for (const link of heatmapLinks) {
    const escapedUrl = escapeRegExp(link.url);
    const color = INTENSITY_COLORS[link.intensity];

    // Find anchors with this href and add overlay styles
    const regex = new RegExp(
      `(<a\\b[^>]*\\bhref=")${escapedUrl}("[^>]*>)`,
      'gi',
    );

    result = result.replace(regex, (_match, prefix: string, suffix: string) => {
      const dataAttrs = `data-heatmap-clicks="${link.totalClicks}" data-heatmap-pct="${link.percentage.toFixed(1)}" data-heatmap-intensity="${link.intensity}"`;
      const style = `outline: 3px solid ${color}; outline-offset: 2px;`;
      return `${prefix}${link.url}${suffix.replace('>', ` ${dataAttrs} style="${style}">`)}`;
    });
  }

  return result;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
