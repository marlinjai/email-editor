import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsTracker, aggregateStats } from '../tracker';
import type { AnalyticsStorageAdapter, TrackingEvent } from '../types';

function makeEvent(overrides?: Partial<TrackingEvent>): TrackingEvent {
  return {
    id: 'evt1',
    campaignId: 'camp1',
    contactId: 'c1',
    type: 'open',
    timestamp: '2024-06-01T10:00:00Z',
    ...overrides,
  };
}

describe('AnalyticsTracker', () => {
  let adapter: AnalyticsStorageAdapter;
  let tracker: AnalyticsTracker;

  beforeEach(() => {
    adapter = {
      recordEvent: vi.fn().mockResolvedValue(makeEvent()),
      listEvents: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      getCampaignStats: vi.fn().mockResolvedValue(null),
      upsertCampaignStats: vi.fn().mockResolvedValue(undefined),
      getContactEngagement: vi.fn().mockResolvedValue(null),
      listLinkClicks: vi.fn().mockResolvedValue([]),
    };
    tracker = new AnalyticsTracker({ adapter });
  });

  it('should record an open event', async () => {
    const event = await tracker.recordOpen('camp1', 'c1', 'Mozilla/5.0', '1.2.3.4');
    expect(adapter.recordEvent).toHaveBeenCalledWith({
      campaignId: 'camp1',
      contactId: 'c1',
      type: 'open',
      userAgent: 'Mozilla/5.0',
      ipAddress: '1.2.3.4',
    });
    expect(event.id).toBe('evt1');
  });

  it('should record a click event', async () => {
    await tracker.recordClick('camp1', 'c1', 'https://example.com');
    expect(adapter.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'click',
        url: 'https://example.com',
      }),
    );
  });

  it('should record a bounce event', async () => {
    await tracker.recordBounce('camp1', 'c1');
    expect(adapter.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bounce' }),
    );
  });

  it('should record an unsubscribe event', async () => {
    await tracker.recordUnsubscribe('camp1', 'c1');
    expect(adapter.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unsubscribe' }),
    );
  });

  it('should record a delivery event', async () => {
    await tracker.recordDelivery('camp1', 'c1');
    expect(adapter.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delivered' }),
    );
  });

  it('should record a complaint event', async () => {
    await tracker.recordComplaint('camp1', 'c1');
    expect(adapter.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'complaint' }),
    );
  });

  it('should refresh campaign stats after recording', async () => {
    await tracker.recordOpen('camp1', 'c1');
    expect(adapter.upsertCampaignStats).toHaveBeenCalled();
  });

  it('should get campaign stats', async () => {
    await tracker.getCampaignStats('camp1');
    expect(adapter.getCampaignStats).toHaveBeenCalledWith('camp1');
  });

  it('should list events', async () => {
    await tracker.listEvents({ campaignId: 'camp1' });
    expect(adapter.listEvents).toHaveBeenCalledWith({ campaignId: 'camp1' });
  });

  it('should get link clicks', async () => {
    await tracker.getLinkClicks('camp1');
    expect(adapter.listLinkClicks).toHaveBeenCalledWith('camp1');
  });
});

describe('aggregateStats', () => {
  it('should aggregate empty events', () => {
    const stats = aggregateStats('camp1', []);
    expect(stats.campaignId).toBe('camp1');
    expect(stats.totalSent).toBe(0);
    expect(stats.openRate).toBe(0);
  });

  it('should count totals correctly', () => {
    const events: TrackingEvent[] = [
      makeEvent({ id: '1', type: 'delivered', contactId: 'c1' }),
      makeEvent({ id: '2', type: 'delivered', contactId: 'c2' }),
      makeEvent({ id: '3', type: 'open', contactId: 'c1' }),
      makeEvent({ id: '4', type: 'open', contactId: 'c1' }),
      makeEvent({ id: '5', type: 'open', contactId: 'c2' }),
      makeEvent({ id: '6', type: 'click', contactId: 'c1', url: 'https://a.com' }),
      makeEvent({ id: '7', type: 'bounce', contactId: 'c3' }),
    ];
    const stats = aggregateStats('camp1', events);

    expect(stats.totalSent).toBe(3); // 2 delivered + 1 bounce
    expect(stats.totalDelivered).toBe(2);
    expect(stats.totalOpens).toBe(3);
    expect(stats.uniqueOpens).toBe(2);
    expect(stats.totalClicks).toBe(1);
    expect(stats.uniqueClicks).toBe(1);
    expect(stats.totalBounces).toBe(1);
  });

  it('should calculate rates correctly', () => {
    const events: TrackingEvent[] = [
      makeEvent({ id: '1', type: 'delivered', contactId: 'c1' }),
      makeEvent({ id: '2', type: 'delivered', contactId: 'c2' }),
      makeEvent({ id: '3', type: 'open', contactId: 'c1' }),
      makeEvent({ id: '4', type: 'click', contactId: 'c1', url: 'https://a.com' }),
    ];
    const stats = aggregateStats('camp1', events);

    // totalSent = 2 (delivered), uniqueOpens = 1, uniqueClicks = 1
    expect(stats.openRate).toBe(0.5);
    expect(stats.clickRate).toBe(0.5);
    expect(stats.clickToOpenRate).toBe(1);
  });

  it('should handle unsubscribes and complaints', () => {
    const events: TrackingEvent[] = [
      makeEvent({ id: '1', type: 'delivered', contactId: 'c1' }),
      makeEvent({ id: '2', type: 'unsubscribe', contactId: 'c1' }),
      makeEvent({ id: '3', type: 'complaint', contactId: 'c1' }),
    ];
    const stats = aggregateStats('camp1', events);

    expect(stats.totalUnsubscribes).toBe(1);
    expect(stats.totalComplaints).toBe(1);
    expect(stats.unsubscribeRate).toBe(1);
  });
});
