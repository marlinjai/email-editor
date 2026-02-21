import type { DataBrain, Row, CellValue } from '@marlinjai/data-brain-sdk';
import type {
  AnalyticsStorageAdapter,
  CampaignStats,
  ContactEngagement,
  EventListOptions,
  LinkClickStats,
  RecordEventInput,
  TrackingEvent,
  TrackingEventType,
} from './types';
import { buildContactEngagement } from './engagement';

export interface DataBrainAnalyticsAdapterConfig {
  client: DataBrain;
  eventsTableId: string;
  statsTableId: string;
}

function rowToEvent(row: Row): TrackingEvent {
  const cells = row.cells;
  return {
    id: row.id,
    campaignId: String(cells.campaign_id ?? ''),
    contactId: String(cells.contact_id ?? ''),
    type: String(cells.type ?? 'open') as TrackingEventType,
    url: cells.url ? String(cells.url) : undefined,
    userAgent: cells.user_agent ? String(cells.user_agent) : undefined,
    ipAddress: cells.ip_address ? String(cells.ip_address) : undefined,
    timestamp: cells.timestamp ? String(cells.timestamp) : (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)),
  };
}

function rowToStats(row: Row): CampaignStats {
  const cells = row.cells;
  return {
    campaignId: String(cells.campaign_id ?? ''),
    totalSent: Number(cells.total_sent ?? 0),
    totalDelivered: Number(cells.total_delivered ?? 0),
    totalOpens: Number(cells.total_opens ?? 0),
    uniqueOpens: Number(cells.unique_opens ?? 0),
    totalClicks: Number(cells.total_clicks ?? 0),
    uniqueClicks: Number(cells.unique_clicks ?? 0),
    totalBounces: Number(cells.total_bounces ?? 0),
    totalUnsubscribes: Number(cells.total_unsubscribes ?? 0),
    totalComplaints: Number(cells.total_complaints ?? 0),
    openRate: Number(cells.open_rate ?? 0),
    clickRate: Number(cells.click_rate ?? 0),
    clickToOpenRate: Number(cells.click_to_open_rate ?? 0),
    bounceRate: Number(cells.bounce_rate ?? 0),
    unsubscribeRate: Number(cells.unsubscribe_rate ?? 0),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export class DataBrainAnalyticsAdapter implements AnalyticsStorageAdapter {
  private client: DataBrain;
  private eventsTableId: string;
  private statsTableId: string;

  constructor(config: DataBrainAnalyticsAdapterConfig) {
    this.client = config.client;
    this.eventsTableId = config.eventsTableId;
    this.statsTableId = config.statsTableId;
  }

  async recordEvent(input: RecordEventInput): Promise<TrackingEvent> {
    const row = await this.client.createRow({
      tableId: this.eventsTableId,
      cells: {
        campaign_id: input.campaignId,
        contact_id: input.contactId,
        type: input.type,
        url: input.url ?? '',
        user_agent: input.userAgent ?? '',
        ip_address: input.ipAddress ?? '',
        timestamp: new Date().toISOString(),
      },
    });
    return rowToEvent(row);
  }

  async listEvents(options?: EventListOptions): Promise<{ data: TrackingEvent[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: string; value: unknown }> = [];

    if (options?.campaignId) {
      filters.push({ columnId: 'campaign_id', operator: 'eq', value: options.campaignId });
    }
    if (options?.contactId) {
      filters.push({ columnId: 'contact_id', operator: 'eq', value: options.contactId });
    }
    if (options?.type) {
      filters.push({ columnId: 'type', operator: 'eq', value: options.type });
    }

    const result = await this.client.getRows(this.eventsTableId, {
      limit: pageSize,
      offset,
      filters: filters as never,
    });

    return {
      data: result.items.map((r) => rowToEvent(r)),
      total: result.total,
    };
  }

  async getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
    const result = await this.client.getRows(this.statsTableId, {
      limit: 1,
      filters: [{ columnId: 'campaign_id', operator: 'eq', value: campaignId }] as never,
    });

    if (result.items.length === 0) return null;
    return rowToStats(result.items[0]!);
  }

  async upsertCampaignStats(stats: CampaignStats): Promise<void> {
    const existing = await this.getCampaignStats(stats.campaignId);

    const cells: Record<string, CellValue> = {
      campaign_id: stats.campaignId,
      total_sent: stats.totalSent,
      total_delivered: stats.totalDelivered,
      total_opens: stats.totalOpens,
      unique_opens: stats.uniqueOpens,
      total_clicks: stats.totalClicks,
      unique_clicks: stats.uniqueClicks,
      total_bounces: stats.totalBounces,
      total_unsubscribes: stats.totalUnsubscribes,
      total_complaints: stats.totalComplaints,
      open_rate: stats.openRate,
      click_rate: stats.clickRate,
      click_to_open_rate: stats.clickToOpenRate,
      bounce_rate: stats.bounceRate,
      unsubscribe_rate: stats.unsubscribeRate,
    };

    if (existing) {
      // Find the row ID to update: re-fetch to get the actual row
      const result = await this.client.getRows(this.statsTableId, {
        limit: 1,
        filters: [{ columnId: 'campaign_id', operator: 'eq', value: stats.campaignId }] as never,
      });
      if (result.items[0]) {
        await this.client.updateRow(result.items[0].id, cells);
      }
    } else {
      await this.client.createRow({
        tableId: this.statsTableId,
        cells,
      });
    }
  }

  async getContactEngagement(campaignId: string, contactId: string): Promise<ContactEngagement | null> {
    const result = await this.client.getRows(this.eventsTableId, {
      limit: 10000,
      filters: [
        { columnId: 'campaign_id', operator: 'eq', value: campaignId },
        { columnId: 'contact_id', operator: 'eq', value: contactId },
      ] as never,
    });

    if (result.items.length === 0) return null;

    const events = result.items.map((r) => rowToEvent(r));
    return buildContactEngagement(contactId, events);
  }

  async listLinkClicks(campaignId: string): Promise<LinkClickStats[]> {
    const result = await this.client.getRows(this.eventsTableId, {
      limit: 10000,
      filters: [
        { columnId: 'campaign_id', operator: 'eq', value: campaignId },
        { columnId: 'type', operator: 'eq', value: 'click' },
      ] as never,
    });

    const events = result.items.map((r) => rowToEvent(r));

    // Aggregate clicks by URL
    const urlMap = new Map<string, { total: number; contacts: Set<string> }>();

    for (const event of events) {
      if (!event.url) continue;
      const existing = urlMap.get(event.url) ?? { total: 0, contacts: new Set<string>() };
      existing.total++;
      existing.contacts.add(event.contactId);
      urlMap.set(event.url, existing);
    }

    return Array.from(urlMap.entries()).map(([url, data]) => ({
      url,
      totalClicks: data.total,
      uniqueClicks: data.contacts.size,
    }));
  }
}
