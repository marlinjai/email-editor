import React, { useState, useEffect, useCallback } from 'react';
import type { CampaignComparison, AnalyticsStorageAdapter } from '../types';
import type { CampaignStorageAdapter } from '@marlinjai/email-campaigns';
import { compareCampaigns, getBestPerformer, calculateImprovement } from '../comparison';

export interface ComparisonChartProps {
  campaignIds: string[];
  campaignAdapter: CampaignStorageAdapter;
  analyticsAdapter: AnalyticsStorageAdapter;
}

type Metric = 'openRate' | 'clickRate' | 'clickToOpenRate';

const METRIC_LABELS: Record<Metric, string> = {
  openRate: 'Open Rate',
  clickRate: 'Click Rate',
  clickToOpenRate: 'Click-to-Open Rate',
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ComparisonChart({
  campaignIds,
  campaignAdapter,
  analyticsAdapter,
}: ComparisonChartProps) {
  const [comparison, setComparison] = useState<CampaignComparison | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<Metric>('openRate');
  const [loading, setLoading] = useState(true);

  const loadComparison = useCallback(async () => {
    setLoading(true);
    try {
      const result = await compareCampaigns(campaignIds, campaignAdapter, analyticsAdapter);
      setComparison(result);
    } finally {
      setLoading(false);
    }
  }, [campaignIds, campaignAdapter, analyticsAdapter]);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  if (loading) {
    return <div className="ec-comparison__loading">Loading comparison...</div>;
  }

  if (!comparison || comparison.campaigns.length === 0) {
    return <div className="ec-comparison__empty">No campaign data available for comparison.</div>;
  }

  const best = getBestPerformer(comparison, selectedMetric);
  const maxValue = Math.max(...comparison.campaigns.map((c) => c.stats[selectedMetric]));

  return (
    <div className="ec-comparison">
      <div className="ec-comparison__header">
        <h3>Campaign Comparison</h3>
        <select
          value={selectedMetric}
          onChange={(e) => setSelectedMetric(e.target.value as Metric)}
          className="ec-comparison__metric-select"
        >
          {(Object.keys(METRIC_LABELS) as Metric[]).map((metric) => (
            <option key={metric} value={metric}>
              {METRIC_LABELS[metric]}
            </option>
          ))}
        </select>
      </div>

      {/* Bar Chart */}
      <div className="ec-comparison__chart">
        {comparison.campaigns.map((campaign) => {
          const value = campaign.stats[selectedMetric];
          const barWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;
          const isBest = best?.campaignId === campaign.campaignId;

          return (
            <div key={campaign.campaignId} className="ec-comparison__bar-row">
              <div className="ec-comparison__bar-label">
                {campaign.name}
                {isBest && <span className="ec-comparison__best-badge">Best</span>}
              </div>
              <div className="ec-comparison__bar-container">
                <div
                  className={`ec-comparison__bar ${isBest ? 'ec-comparison__bar--best' : ''}`}
                  style={{ width: `${barWidth}%` }}
                />
                <span className="ec-comparison__bar-value">{formatPercent(value)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table */}
      <div className="ec-comparison__table-container">
        <table className="ec-comparison__table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Sent</th>
              <th>Open Rate</th>
              <th>Click Rate</th>
              <th>CTO Rate</th>
              <th>Bounces</th>
              <th>Unsubs</th>
            </tr>
          </thead>
          <tbody>
            {comparison.campaigns.map((campaign) => (
              <tr key={campaign.campaignId}>
                <td>{campaign.name}</td>
                <td>{campaign.stats.totalSent}</td>
                <td>{formatPercent(campaign.stats.openRate)}</td>
                <td>{formatPercent(campaign.stats.clickRate)}</td>
                <td>{formatPercent(campaign.stats.clickToOpenRate)}</td>
                <td>{campaign.stats.totalBounces}</td>
                <td>{campaign.stats.totalUnsubscribes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Improvement */}
      {comparison.campaigns.length === 2 && (
        <div className="ec-comparison__improvement">
          <h4>Improvement</h4>
          {(Object.keys(METRIC_LABELS) as Metric[]).map((metric) => {
            const improvement = calculateImprovement(
              comparison.campaigns[0]!.stats,
              comparison.campaigns[1]!.stats,
              metric,
            );
            return (
              <div key={metric} className="ec-comparison__improvement-item">
                <span>{METRIC_LABELS[metric]}:</span>
                <span className={improvement >= 0 ? 'ec-comparison__positive' : 'ec-comparison__negative'}>
                  {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
