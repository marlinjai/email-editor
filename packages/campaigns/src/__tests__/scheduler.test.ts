import { describe, it, expect, vi } from 'vitest';
import { getScheduledCampaignsReadyToSend, toUTCScheduledTime } from '../scheduler';
import type { Campaign, CampaignStorageAdapter } from '../types';

function makeCampaign(overrides?: Partial<Campaign>): Campaign {
  return {
    id: 'c1',
    name: 'Test Campaign',
    templateId: 't1',
    status: 'scheduled',
    subject: 'Hello',
    fromName: 'Test',
    fromEmail: 'test@example.com',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getScheduledCampaignsReadyToSend', () => {
  it('should return campaigns scheduled in the past', async () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    const adapter: CampaignStorageAdapter = {
      listCampaigns: vi.fn().mockResolvedValue({
        data: [
          makeCampaign({ id: 'c1', scheduledAt: pastDate }),
          makeCampaign({ id: 'c2', scheduledAt: new Date(Date.now() + 3600000).toISOString() }),
        ],
        total: 2,
      }),
    } as unknown as CampaignStorageAdapter;

    const result = await getScheduledCampaignsReadyToSend(adapter);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('c1');
  });

  it('should return empty array when no campaigns are ready', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const adapter: CampaignStorageAdapter = {
      listCampaigns: vi.fn().mockResolvedValue({
        data: [makeCampaign({ scheduledAt: futureDate })],
        total: 1,
      }),
    } as unknown as CampaignStorageAdapter;

    const result = await getScheduledCampaignsReadyToSend(adapter);
    expect(result).toHaveLength(0);
  });

  it('should skip campaigns without scheduledAt', async () => {
    const adapter: CampaignStorageAdapter = {
      listCampaigns: vi.fn().mockResolvedValue({
        data: [makeCampaign({ scheduledAt: undefined })],
        total: 1,
      }),
    } as unknown as CampaignStorageAdapter;

    const result = await getScheduledCampaignsReadyToSend(adapter);
    expect(result).toHaveLength(0);
  });
});

describe('toUTCScheduledTime', () => {
  it('should return ISO string for date without timezone', () => {
    const result = toUTCScheduledTime('2024-06-15T10:00:00');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should handle ISO string input', () => {
    const result = toUTCScheduledTime('2024-06-15T10:00:00Z');
    expect(result).toBe('2024-06-15T10:00:00.000Z');
  });

  it('should handle timezone parameter', () => {
    const result = toUTCScheduledTime('2024-06-15T10:00:00', 'America/New_York');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
