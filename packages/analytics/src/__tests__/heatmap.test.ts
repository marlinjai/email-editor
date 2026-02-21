import { describe, it, expect } from 'vitest';
import { generateHeatmapData, injectHeatmapOverlay } from '../heatmap';
import type { LinkClickStats } from '../types';

describe('generateHeatmapData', () => {
  it('should return empty for no stats', () => {
    expect(generateHeatmapData([])).toEqual([]);
  });

  it('should assign percentages', () => {
    const stats: LinkClickStats[] = [
      { url: 'https://a.com', totalClicks: 50, uniqueClicks: 30 },
      { url: 'https://b.com', totalClicks: 50, uniqueClicks: 20 },
    ];
    const result = generateHeatmapData(stats);
    expect(result[0]!.percentage).toBe(50);
    expect(result[1]!.percentage).toBe(50);
  });

  it('should assign intensity based on relative clicks', () => {
    const stats: LinkClickStats[] = [
      { url: 'https://a.com', totalClicks: 100, uniqueClicks: 80 },
      { url: 'https://b.com', totalClicks: 60, uniqueClicks: 40 },
      { url: 'https://c.com', totalClicks: 30, uniqueClicks: 20 },
      { url: 'https://d.com', totalClicks: 10, uniqueClicks: 5 },
    ];
    const result = generateHeatmapData(stats);

    expect(result[0]!.intensity).toBe('very_hot'); // 100/100 = 1.0
    expect(result[1]!.intensity).toBe('hot');       // 60/100 = 0.6
    expect(result[2]!.intensity).toBe('warm');      // 30/100 = 0.3
    expect(result[3]!.intensity).toBe('cold');      // 10/100 = 0.1
  });

  it('should handle single link', () => {
    const stats: LinkClickStats[] = [
      { url: 'https://a.com', totalClicks: 50, uniqueClicks: 30 },
    ];
    const result = generateHeatmapData(stats);
    expect(result[0]!.percentage).toBe(100);
    expect(result[0]!.intensity).toBe('very_hot');
  });
});

describe('injectHeatmapOverlay', () => {
  it('should add data attributes to links', () => {
    const html = '<a href="https://a.com">Link A</a>';
    const heatmapLinks = generateHeatmapData([
      { url: 'https://a.com', totalClicks: 50, uniqueClicks: 30 },
    ]);

    const result = injectHeatmapOverlay(html, heatmapLinks);
    expect(result).toContain('data-heatmap-clicks="50"');
    expect(result).toContain('data-heatmap-intensity="very_hot"');
  });

  it('should add outline style', () => {
    const html = '<a href="https://a.com">Link A</a>';
    const heatmapLinks = generateHeatmapData([
      { url: 'https://a.com', totalClicks: 50, uniqueClicks: 30 },
    ]);

    const result = injectHeatmapOverlay(html, heatmapLinks);
    expect(result).toContain('outline:');
  });

  it('should handle multiple links', () => {
    const html = '<a href="https://a.com">A</a><a href="https://b.com">B</a>';
    const heatmapLinks = generateHeatmapData([
      { url: 'https://a.com', totalClicks: 80, uniqueClicks: 50 },
      { url: 'https://b.com', totalClicks: 20, uniqueClicks: 10 },
    ]);

    const result = injectHeatmapOverlay(html, heatmapLinks);
    expect(result).toContain('data-heatmap-clicks="80"');
    expect(result).toContain('data-heatmap-clicks="20"');
  });

  it('should not modify links not in heatmap', () => {
    const html = '<a href="https://other.com">Other</a>';
    const heatmapLinks = generateHeatmapData([
      { url: 'https://a.com', totalClicks: 50, uniqueClicks: 30 },
    ]);

    const result = injectHeatmapOverlay(html, heatmapLinks);
    expect(result).not.toContain('data-heatmap');
    expect(result).toBe(html);
  });
});
