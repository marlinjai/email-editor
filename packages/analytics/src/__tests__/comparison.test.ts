import { describe, it, expect, vi } from 'vitest';
import { compareCampaigns, getBestPerformer, calculateImprovement } from '../comparison';
import type { CampaignStats, CampaignComparison, AnalyticsStorageAdapter } from '../types';
import type { CampaignStorageAdapter, Campaign } from '@marlinjai/email-campaigns';

function makeCampaign(id: string, name: string): Campaign {
  return {
    id,
    name,
    templateId: 't1',
    status: 'sent',
    subject: 'Test',
    fromName: 'Test',
    fromEmail: 'test@example.com',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeStats(campaignId: string, overrides?: Partial<CampaignStats>): CampaignStats {
  return {
    campaignId,
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

describe('compareCampaigns', () => {
  it('should return comparison data', async () => {
    const campaignAdapter: CampaignStorageAdapter = {
      getCampaign: vi.fn()
        .mockResolvedValueOnce(makeCampaign('c1', 'Campaign A'))
        .mockResolvedValueOnce(makeCampaign('c2', 'Campaign B')),
    } as unknown as CampaignStorageAdapter;

    const analyticsAdapter: AnalyticsStorageAdapter = {
      getCampaignStats: vi.fn()
        .mockResolvedValueOnce(makeStats('c1', { openRate: 0.3 }))
        .mockResolvedValueOnce(makeStats('c2', { openRate: 0.5 })),
    } as unknown as AnalyticsStorageAdapter;

    const result = await compareCampaigns(['c1', 'c2'], campaignAdapter, analyticsAdapter);
    expect(result.campaigns).toHaveLength(2);
    expect(result.campaigns[0]!.name).toBe('Campaign A');
    expect(result.campaigns[1]!.stats.openRate).toBe(0.5);
  });

  it('should skip campaigns without stats', async () => {
    const campaignAdapter: CampaignStorageAdapter = {
      getCampaign: vi.fn()
        .mockResolvedValueOnce(makeCampaign('c1', 'Campaign A'))
        .mockResolvedValueOnce(null),
    } as unknown as CampaignStorageAdapter;

    const analyticsAdapter: AnalyticsStorageAdapter = {
      getCampaignStats: vi.fn()
        .mockResolvedValueOnce(makeStats('c1'))
        .mockResolvedValueOnce(null),
    } as unknown as AnalyticsStorageAdapter;

    const result = await compareCampaigns(['c1', 'c2'], campaignAdapter, analyticsAdapter);
    expect(result.campaigns).toHaveLength(1);
  });
});

describe('getBestPerformer', () => {
  it('should return campaign with highest open rate', () => {
    const comparison: CampaignComparison = {
      campaigns: [
        { campaignId: 'c1', name: 'A', stats: makeStats('c1', { openRate: 0.3 }) },
        { campaignId: 'c2', name: 'B', stats: makeStats('c2', { openRate: 0.6 }) },
      ],
    };
    const best = getBestPerformer(comparison, 'openRate');
    expect(best?.campaignId).toBe('c2');
  });

  it('should return campaign with highest click rate', () => {
    const comparison: CampaignComparison = {
      campaigns: [
        { campaignId: 'c1', name: 'A', stats: makeStats('c1', { clickRate: 0.2 }) },
        { campaignId: 'c2', name: 'B', stats: makeStats('c2', { clickRate: 0.1 }) },
      ],
    };
    const best = getBestPerformer(comparison, 'clickRate');
    expect(best?.campaignId).toBe('c1');
  });

  it('should return null for empty campaigns', () => {
    expect(getBestPerformer({ campaigns: [] }, 'openRate')).toBeNull();
  });
});

describe('calculateImprovement', () => {
  it('should calculate positive improvement', () => {
    const baseline = makeStats('c1', { openRate: 0.2 });
    const variant = makeStats('c2', { openRate: 0.3 });
    const improvement = calculateImprovement(baseline, variant, 'openRate');
    expect(improvement).toBeCloseTo(50);
  });

  it('should calculate negative improvement', () => {
    const baseline = makeStats('c1', { clickRate: 0.2 });
    const variant = makeStats('c2', { clickRate: 0.1 });
    const improvement = calculateImprovement(baseline, variant, 'clickRate');
    expect(improvement).toBe(-50);
  });

  it('should handle zero baseline', () => {
    const baseline = makeStats('c1', { openRate: 0 });
    const variant = makeStats('c2', { openRate: 0.3 });
    expect(calculateImprovement(baseline, variant, 'openRate')).toBe(100);
  });

  it('should return 0 when both are zero', () => {
    const baseline = makeStats('c1', { openRate: 0 });
    const variant = makeStats('c2', { openRate: 0 });
    expect(calculateImprovement(baseline, variant, 'openRate')).toBe(0);
  });
});
