import React, { useState, useEffect, useCallback } from 'react';
import type { CampaignStats, AnalyticsStorageAdapter, LinkClickStats } from '../types';

export interface CampaignReportProps {
  adapter: AnalyticsStorageAdapter;
  campaignId: string;
  campaignName?: string;
  onExport?: (stats: CampaignStats) => void;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function CampaignReport({
  adapter,
  campaignId,
  campaignName,
  onExport,
}: CampaignReportProps) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [linkClicks, setLinkClicks] = useState<LinkClickStats[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignStats, clicks] = await Promise.all([
        adapter.getCampaignStats(campaignId),
        adapter.listLinkClicks(campaignId),
      ]);
      setStats(campaignStats);
      setLinkClicks(clicks);
    } finally {
      setLoading(false);
    }
  }, [adapter, campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <div className="ec-campaign-report__loading">Loading report...</div>;
  }

  if (!stats) {
    return <div className="ec-campaign-report__empty">No analytics data available for this campaign.</div>;
  }

  return (
    <div className="ec-campaign-report">
      <div className="ec-campaign-report__header">
        <h2 className="ec-campaign-report__title">
          {campaignName ? `Report: ${campaignName}` : 'Campaign Report'}
        </h2>
        {onExport && (
          <button onClick={() => onExport(stats)} className="ec-campaign-report__export-btn">
            Export CSV
          </button>
        )}
      </div>

      {/* Key Metrics */}
      <div className="ec-campaign-report__metrics">
        <div className="ec-campaign-report__metric">
          <span className="ec-campaign-report__metric-value">{stats.totalSent}</span>
          <span className="ec-campaign-report__metric-label">Sent</span>
        </div>
        <div className="ec-campaign-report__metric">
          <span className="ec-campaign-report__metric-value">{stats.totalDelivered}</span>
          <span className="ec-campaign-report__metric-label">Delivered</span>
        </div>
        <div className="ec-campaign-report__metric">
          <span className="ec-campaign-report__metric-value">{formatPercent(stats.openRate)}</span>
          <span className="ec-campaign-report__metric-label">Open Rate</span>
        </div>
        <div className="ec-campaign-report__metric">
          <span className="ec-campaign-report__metric-value">{formatPercent(stats.clickRate)}</span>
          <span className="ec-campaign-report__metric-label">Click Rate</span>
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="ec-campaign-report__details">
        <h3>Detailed Metrics</h3>
        <table className="ec-campaign-report__table">
          <tbody>
            <tr>
              <td>Total Opens</td>
              <td>{stats.totalOpens}</td>
            </tr>
            <tr>
              <td>Unique Opens</td>
              <td>{stats.uniqueOpens}</td>
            </tr>
            <tr>
              <td>Total Clicks</td>
              <td>{stats.totalClicks}</td>
            </tr>
            <tr>
              <td>Unique Clicks</td>
              <td>{stats.uniqueClicks}</td>
            </tr>
            <tr>
              <td>Click-to-Open Rate</td>
              <td>{formatPercent(stats.clickToOpenRate)}</td>
            </tr>
            <tr>
              <td>Bounces</td>
              <td>{stats.totalBounces} ({formatPercent(stats.bounceRate)})</td>
            </tr>
            <tr>
              <td>Unsubscribes</td>
              <td>{stats.totalUnsubscribes} ({formatPercent(stats.unsubscribeRate)})</td>
            </tr>
            <tr>
              <td>Complaints</td>
              <td>{stats.totalComplaints}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Link Clicks */}
      {linkClicks.length > 0 && (
        <div className="ec-campaign-report__links">
          <h3>Link Performance</h3>
          <table className="ec-campaign-report__table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Total Clicks</th>
                <th>Unique Clicks</th>
              </tr>
            </thead>
            <tbody>
              {linkClicks
                .sort((a, b) => b.totalClicks - a.totalClicks)
                .map((link) => (
                  <tr key={link.url}>
                    <td className="ec-campaign-report__link-url">{link.url}</td>
                    <td>{link.totalClicks}</td>
                    <td>{link.uniqueClicks}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
