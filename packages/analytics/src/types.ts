export type TrackingEventType = 'open' | 'click' | 'bounce' | 'unsubscribe' | 'complaint' | 'delivered';

export interface TrackingEvent {
  id: string;
  campaignId: string;
  contactId: string;
  type: TrackingEventType;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
  timestamp: string;
}

export interface RecordEventInput {
  campaignId: string;
  contactId: string;
  type: TrackingEventType;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CampaignStats {
  campaignId: string;
  totalSent: number;
  totalDelivered: number;
  totalOpens: number;
  uniqueOpens: number;
  totalClicks: number;
  uniqueClicks: number;
  totalBounces: number;
  totalUnsubscribes: number;
  totalComplaints: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  updatedAt: string;
}

export interface LinkClickStats {
  url: string;
  totalClicks: number;
  uniqueClicks: number;
}

export interface ContactEngagement {
  contactId: string;
  totalOpens: number;
  totalClicks: number;
  lastOpenAt?: string;
  lastClickAt?: string;
  engagementScore: number;
}

export interface CampaignComparison {
  campaigns: Array<{
    campaignId: string;
    name: string;
    stats: CampaignStats;
  }>;
}

export interface EventListOptions {
  campaignId?: string;
  contactId?: string;
  type?: TrackingEventType;
  page?: number;
  pageSize?: number;
}

export interface AnalyticsStorageAdapter {
  recordEvent(input: RecordEventInput): Promise<TrackingEvent>;
  listEvents(options?: EventListOptions): Promise<{ data: TrackingEvent[]; total: number }>;
  getCampaignStats(campaignId: string): Promise<CampaignStats | null>;
  upsertCampaignStats(stats: CampaignStats): Promise<void>;
  getContactEngagement(campaignId: string, contactId: string): Promise<ContactEngagement | null>;
  listLinkClicks(campaignId: string): Promise<LinkClickStats[]>;
}

export interface CSVExportOptions {
  columns?: string[];
  includeHeaders?: boolean;
}
