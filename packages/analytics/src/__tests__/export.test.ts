import { describe, it, expect } from 'vitest';
import { exportStatsToCSV, exportEventsToCSV, exportLinkClicksToCSV } from '../export';
import type { CampaignStats, TrackingEvent, LinkClickStats } from '../types';

function makeStats(overrides?: Partial<CampaignStats>): CampaignStats {
  return {
    campaignId: 'camp1',
    totalSent: 100,
    totalDelivered: 95,
    totalOpens: 50,
    uniqueOpens: 40,
    totalClicks: 20,
    uniqueClicks: 15,
    totalBounces: 5,
    totalUnsubscribes: 2,
    totalComplaints: 0,
    openRate: 0.4,
    clickRate: 0.15,
    clickToOpenRate: 0.375,
    bounceRate: 0.05,
    unsubscribeRate: 0.02,
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('exportStatsToCSV', () => {
  it('should export stats with headers', () => {
    const csv = exportStatsToCSV([makeStats()]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('campaignId');
    expect(lines[1]).toContain('camp1');
  });

  it('should export without headers', () => {
    const csv = exportStatsToCSV([makeStats()], { includeHeaders: false });
    const lines = csv.split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('camp1');
  });

  it('should export custom columns', () => {
    const csv = exportStatsToCSV([makeStats()], {
      columns: ['campaignId', 'openRate'],
    });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('campaignId,openRate');
    expect(lines[1]).toBe('camp1,0.4');
  });

  it('should handle multiple rows', () => {
    const csv = exportStatsToCSV([
      makeStats({ campaignId: 'c1' }),
      makeStats({ campaignId: 'c2' }),
    ]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(3);
  });
});

describe('exportEventsToCSV', () => {
  it('should export events', () => {
    const events: TrackingEvent[] = [
      {
        id: 'evt1',
        campaignId: 'camp1',
        contactId: 'c1',
        type: 'open',
        timestamp: '2024-06-01T10:00:00Z',
      },
    ];
    const csv = exportEventsToCSV(events);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[1]).toContain('evt1');
    expect(lines[1]).toContain('open');
  });

  it('should escape fields with commas', () => {
    const events: TrackingEvent[] = [
      {
        id: 'evt1',
        campaignId: 'camp1',
        contactId: 'c1',
        type: 'click',
        url: 'https://example.com?a=1,b=2',
        timestamp: '2024-06-01T10:00:00Z',
      },
    ];
    const csv = exportEventsToCSV(events, { columns: ['url'] });
    expect(csv).toContain('"https://example.com?a=1,b=2"');
  });
});

describe('exportLinkClicksToCSV', () => {
  it('should export link stats', () => {
    const links: LinkClickStats[] = [
      { url: 'https://a.com', totalClicks: 50, uniqueClicks: 30 },
      { url: 'https://b.com', totalClicks: 20, uniqueClicks: 10 },
    ];
    const csv = exportLinkClicksToCSV(links);
    const lines = csv.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe('url,totalClicks,uniqueClicks');
    expect(lines[1]).toContain('https://a.com');
  });
});
