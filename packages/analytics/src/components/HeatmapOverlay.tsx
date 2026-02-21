import React, { useState, useEffect, useCallback } from 'react';
import type { AnalyticsStorageAdapter } from '../types';
import type { HeatmapLink } from '../heatmap';
import { generateHeatmapData, injectHeatmapOverlay } from '../heatmap';

export interface HeatmapOverlayProps {
  adapter: AnalyticsStorageAdapter;
  campaignId: string;
  emailHtml: string;
}

export function HeatmapOverlay({
  adapter,
  campaignId,
  emailHtml,
}: HeatmapOverlayProps) {
  const [heatmapHtml, setHeatmapHtml] = useState(emailHtml);
  const [heatmapLinks, setHeatmapLinks] = useState<HeatmapLink[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHeatmap = useCallback(async () => {
    setLoading(true);
    try {
      const linkStats = await adapter.listLinkClicks(campaignId);
      const links = generateHeatmapData(linkStats);
      setHeatmapLinks(links);
      setHeatmapHtml(injectHeatmapOverlay(emailHtml, links));
    } finally {
      setLoading(false);
    }
  }, [adapter, campaignId, emailHtml]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

  if (loading) {
    return <div className="ec-heatmap__loading">Loading heatmap...</div>;
  }

  return (
    <div className="ec-heatmap">
      <div className="ec-heatmap__legend">
        <h4>Click Heatmap</h4>
        <div className="ec-heatmap__legend-items">
          <span className="ec-heatmap__legend-item ec-heatmap__legend-item--cold">Cold</span>
          <span className="ec-heatmap__legend-item ec-heatmap__legend-item--warm">Warm</span>
          <span className="ec-heatmap__legend-item ec-heatmap__legend-item--hot">Hot</span>
          <span className="ec-heatmap__legend-item ec-heatmap__legend-item--very-hot">Very Hot</span>
        </div>
      </div>

      <div className="ec-heatmap__preview">
        <iframe
          className="ec-heatmap__frame"
          srcDoc={heatmapHtml}
          title="Email Heatmap"
          sandbox="allow-same-origin"
        />
      </div>

      {/* Link Stats Table */}
      {heatmapLinks.length > 0 && (
        <div className="ec-heatmap__stats">
          <table className="ec-heatmap__table">
            <thead>
              <tr>
                <th>Link</th>
                <th>Clicks</th>
                <th>Share</th>
                <th>Intensity</th>
              </tr>
            </thead>
            <tbody>
              {heatmapLinks
                .sort((a, b) => b.totalClicks - a.totalClicks)
                .map((link) => (
                  <tr key={link.url}>
                    <td className="ec-heatmap__link-url">{link.url}</td>
                    <td>{link.totalClicks}</td>
                    <td>{link.percentage.toFixed(1)}%</td>
                    <td>
                      <span className={`ec-heatmap__intensity ec-heatmap__intensity--${link.intensity.replace('_', '-')}`}>
                        {link.intensity.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
