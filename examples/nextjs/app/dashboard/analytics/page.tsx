'use client';

import { CampaignReport } from '@marlinjai/email-analytics/react';
import type { AnalyticsStorageAdapter, CampaignStats, LinkClickStats } from '@marlinjai/email-analytics/react';

const MOCK_STATS: CampaignStats = {
  campaignId: 'camp1',
  totalSent: 3612,
  totalDelivered: 3540,
  totalOpens: 1860,
  uniqueOpens: 1565,
  totalClicks: 482,
  uniqueClicks: 315,
  totalBounces: 72,
  totalUnsubscribes: 18,
  totalComplaints: 2,
  openRate: 0.442,
  clickRate: 0.089,
  clickToOpenRate: 0.201,
  bounceRate: 0.02,
  unsubscribeRate: 0.005,
  updatedAt: '2026-02-18T12:00:00Z',
};

const MOCK_LINK_CLICKS: LinkClickStats[] = [
  { url: 'https://example.com/product', totalClicks: 210, uniqueClicks: 158 },
  { url: 'https://example.com/blog', totalClicks: 145, uniqueClicks: 98 },
  { url: 'https://example.com/pricing', totalClicks: 87, uniqueClicks: 42 },
  { url: 'https://example.com/docs', totalClicks: 40, uniqueClicks: 17 },
];

const mockAdapter: AnalyticsStorageAdapter = {
  recordEvent: async () => ({ id: 'evt1', campaignId: 'camp1', contactId: 'c1', type: 'open' as const, timestamp: new Date().toISOString() }),
  getCampaignStats: async () => MOCK_STATS,
  listEvents: async () => ({ data: [], total: 0 }),
  getContactEngagement: async () => null,
  listLinkClicks: async () => MOCK_LINK_CLICKS,
  upsertCampaignStats: async () => {},
};

export default function AnalyticsPage() {
  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Analytics</h1>
        <p>Campaign performance and engagement metrics</p>
      </div>
      <div className="dashboard-section">
        <CampaignReport
          adapter={mockAdapter}
          campaignId="camp1"
          campaignName="February Newsletter"
        />
      </div>
    </div>
  );
}
