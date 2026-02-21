export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface Campaign {
  id: string;
  name: string;
  templateId: string;
  segmentId?: string;
  status: CampaignStatus;
  subject: string;
  previewText?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  scheduledAt?: string;
  sentAt?: string;
  sendProvider?: string;
  abTestConfig?: ABTestConfig;
  totalRecipients?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ABTestConfig {
  enabled: boolean;
  variants: ABVariant[];
  winnerCriteria: 'open_rate' | 'click_rate';
  testPercentage: number;
  testDurationHours: number;
}

export interface ABVariant {
  id: string;
  name: string;
  subject?: string;
  templateId?: string;
  percentage: number;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  contactId: string;
  email: string;
  status: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed';
  sentAt?: string;
  providerMessageId?: string;
}

export interface SendAdapter {
  send(options: SendOptions): Promise<SendResult>;
  sendBatch(options: BatchSendOptions): Promise<BatchSendResult>;
}

export interface SendOptions {
  to: string;
  from: { name: string; email: string };
  replyTo?: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BatchSendOptions {
  messages: SendOptions[];
}

export interface BatchSendResult {
  results: SendResult[];
  totalSent: number;
  totalFailed: number;
}

export interface CreateCampaignInput {
  name: string;
  templateId: string;
  segmentId?: string;
  subject: string;
  previewText?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  abTestConfig?: ABTestConfig;
}

export interface UpdateCampaignInput {
  name?: string;
  templateId?: string;
  segmentId?: string;
  subject?: string;
  previewText?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  abTestConfig?: ABTestConfig;
}

export interface ScheduleCampaignInput {
  scheduledAt: string;
  timezone?: string;
}

export interface CampaignListOptions {
  status?: CampaignStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CampaignStorageAdapter {
  createCampaign(input: CreateCampaignInput): Promise<Campaign>;
  getCampaign(id: string): Promise<Campaign | null>;
  listCampaigns(options?: CampaignListOptions): Promise<{ data: Campaign[]; total: number }>;
  updateCampaign(id: string, input: UpdateCampaignInput & { status?: CampaignStatus; scheduledAt?: string; sentAt?: string; totalRecipients?: number; sendProvider?: string }): Promise<Campaign>;
  deleteCampaign(id: string): Promise<void>;
  createRecipient(campaignId: string, contactId: string, email: string): Promise<CampaignRecipient>;
  listRecipients(campaignId: string, options?: { status?: CampaignRecipient['status']; page?: number; pageSize?: number }): Promise<{ data: CampaignRecipient[]; total: number }>;
  updateRecipientStatus(recipientId: string, status: CampaignRecipient['status'], providerMessageId?: string): Promise<void>;
  bulkCreateRecipients(recipients: Array<{ campaignId: string; contactId: string; email: string }>): Promise<number>;
}
