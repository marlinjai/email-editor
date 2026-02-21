import type {
  AnalyticsStorageAdapter,
  CampaignStats,
  ContactEngagement,
  LinkClickStats,
  RecordEventInput,
  TrackingEvent,
  TrackingEventType,
  EventListOptions,
} from './types';

export interface AnalyticsTrackerConfig {
  adapter: AnalyticsStorageAdapter;
}

export class AnalyticsTracker {
  private readonly adapter: AnalyticsStorageAdapter;

  constructor(config: AnalyticsTrackerConfig) {
    this.adapter = config.adapter;
  }

  /**
   * Record a tracking event and update aggregated stats.
   */
  async recordEvent(input: RecordEventInput): Promise<TrackingEvent> {
    const event = await this.adapter.recordEvent(input);
    await this.refreshCampaignStats(input.campaignId);
    return event;
  }

  /**
   * Record an open event (triggered by tracking pixel load).
   */
  async recordOpen(campaignId: string, contactId: string, userAgent?: string, ipAddress?: string): Promise<TrackingEvent> {
    return this.recordEvent({ campaignId, contactId, type: 'open', userAgent, ipAddress });
  }

  /**
   * Record a click event (triggered by click tracking redirect).
   */
  async recordClick(campaignId: string, contactId: string, url: string, userAgent?: string, ipAddress?: string): Promise<TrackingEvent> {
    return this.recordEvent({ campaignId, contactId, type: 'click', url, userAgent, ipAddress });
  }

  /**
   * Record a bounce event.
   */
  async recordBounce(campaignId: string, contactId: string): Promise<TrackingEvent> {
    return this.recordEvent({ campaignId, contactId, type: 'bounce' });
  }

  /**
   * Record an unsubscribe event.
   */
  async recordUnsubscribe(campaignId: string, contactId: string): Promise<TrackingEvent> {
    return this.recordEvent({ campaignId, contactId, type: 'unsubscribe' });
  }

  /**
   * Record a delivery event.
   */
  async recordDelivery(campaignId: string, contactId: string): Promise<TrackingEvent> {
    return this.recordEvent({ campaignId, contactId, type: 'delivered' });
  }

  /**
   * Record a complaint/spam report event.
   */
  async recordComplaint(campaignId: string, contactId: string): Promise<TrackingEvent> {
    return this.recordEvent({ campaignId, contactId, type: 'complaint' });
  }

  /**
   * Get aggregated stats for a campaign.
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    return this.adapter.getCampaignStats(campaignId);
  }

  /**
   * List tracking events with filters.
   */
  async listEvents(options?: EventListOptions): Promise<{ data: TrackingEvent[]; total: number }> {
    return this.adapter.listEvents(options);
  }

  /**
   * Get contact engagement for a specific campaign.
   */
  async getContactEngagement(campaignId: string, contactId: string): Promise<ContactEngagement | null> {
    return this.adapter.getContactEngagement(campaignId, contactId);
  }

  /**
   * Get link click stats for a campaign.
   */
  async getLinkClicks(campaignId: string): Promise<LinkClickStats[]> {
    return this.adapter.listLinkClicks(campaignId);
  }

  /**
   * Recalculate and persist campaign stats from raw events.
   */
  async refreshCampaignStats(campaignId: string): Promise<CampaignStats> {
    const allEvents = await this.adapter.listEvents({ campaignId, pageSize: 100000 });
    const stats = aggregateStats(campaignId, allEvents.data);
    await this.adapter.upsertCampaignStats(stats);
    return stats;
  }
}

/**
 * Aggregate raw events into campaign stats.
 */
export function aggregateStats(campaignId: string, events: TrackingEvent[]): CampaignStats {
  const byType = groupByType(events);

  const totalSent = (byType.delivered?.length ?? 0) + (byType.bounce?.length ?? 0);
  const totalDelivered = byType.delivered?.length ?? 0;
  const totalOpens = byType.open?.length ?? 0;
  const totalClicks = byType.click?.length ?? 0;
  const totalBounces = byType.bounce?.length ?? 0;
  const totalUnsubscribes = byType.unsubscribe?.length ?? 0;
  const totalComplaints = byType.complaint?.length ?? 0;

  const uniqueOpens = countUnique(byType.open ?? [], 'contactId');
  const uniqueClicks = countUnique(byType.click ?? [], 'contactId');

  const denominator = Math.max(totalSent, 1);

  return {
    campaignId,
    totalSent,
    totalDelivered,
    totalOpens,
    uniqueOpens,
    totalClicks,
    uniqueClicks,
    totalBounces,
    totalUnsubscribes,
    totalComplaints,
    openRate: uniqueOpens / denominator,
    clickRate: uniqueClicks / denominator,
    clickToOpenRate: uniqueOpens > 0 ? uniqueClicks / uniqueOpens : 0,
    bounceRate: totalBounces / denominator,
    unsubscribeRate: totalUnsubscribes / denominator,
    updatedAt: new Date().toISOString(),
  };
}

function groupByType(events: TrackingEvent[]): Partial<Record<TrackingEventType, TrackingEvent[]>> {
  const groups: Partial<Record<TrackingEventType, TrackingEvent[]>> = {};
  for (const event of events) {
    if (!groups[event.type]) groups[event.type] = [];
    groups[event.type]!.push(event);
  }
  return groups;
}

function countUnique(events: TrackingEvent[], key: keyof TrackingEvent): number {
  const seen = new Set<string>();
  for (const event of events) {
    const val = event[key];
    if (typeof val === 'string') seen.add(val);
  }
  return seen.size;
}
