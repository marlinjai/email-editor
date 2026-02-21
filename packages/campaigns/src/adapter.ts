import type { DataBrain, Row, CellValue } from '@marlinjai/data-brain-sdk';
import type {
  Campaign,
  CampaignListOptions,
  CampaignRecipient,
  CampaignStorageAdapter,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignStatus,
} from './types';

export interface DataBrainCampaignAdapterConfig {
  client: DataBrain;
  campaignsTableId: string;
  recipientsTableId: string;
}

function rowToCampaign(row: Row): Campaign {
  const cells = row.cells;
  let abTestConfig = undefined;
  try {
    const raw = cells.ab_test_config ? String(cells.ab_test_config) : '';
    if (raw) abTestConfig = JSON.parse(raw);
  } catch {
    // ignore parse errors
  }

  return {
    id: row.id,
    name: String(cells.name ?? ''),
    templateId: String(cells.template_id ?? ''),
    segmentId: cells.segment_id ? String(cells.segment_id) : undefined,
    status: String(cells.status ?? 'draft') as CampaignStatus,
    subject: String(cells.subject ?? ''),
    previewText: cells.preview_text ? String(cells.preview_text) : undefined,
    fromName: String(cells.from_name ?? ''),
    fromEmail: String(cells.from_email ?? ''),
    replyTo: cells.reply_to ? String(cells.reply_to) : undefined,
    scheduledAt: cells.scheduled_at ? String(cells.scheduled_at) : undefined,
    sentAt: cells.sent_at ? String(cells.sent_at) : undefined,
    sendProvider: cells.send_provider ? String(cells.send_provider) : undefined,
    abTestConfig,
    totalRecipients: cells.total_recipients ? Number(cells.total_recipients) : undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function rowToRecipient(row: Row): CampaignRecipient {
  const cells = row.cells;
  return {
    id: row.id,
    campaignId: String(cells.campaign_id ?? ''),
    contactId: String(cells.contact_id ?? ''),
    email: String(cells.email ?? ''),
    status: String(cells.status ?? 'pending') as CampaignRecipient['status'],
    sentAt: cells.sent_at ? String(cells.sent_at) : undefined,
    providerMessageId: cells.provider_message_id ? String(cells.provider_message_id) : undefined,
  };
}

export class DataBrainCampaignAdapter implements CampaignStorageAdapter {
  private client: DataBrain;
  private campaignsTableId: string;
  private recipientsTableId: string;

  constructor(config: DataBrainCampaignAdapterConfig) {
    this.client = config.client;
    this.campaignsTableId = config.campaignsTableId;
    this.recipientsTableId = config.recipientsTableId;
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const row = await this.client.createRow({
      tableId: this.campaignsTableId,
      cells: {
        name: input.name,
        template_id: input.templateId,
        segment_id: input.segmentId ?? '',
        status: 'draft',
        subject: input.subject,
        preview_text: input.previewText ?? '',
        from_name: input.fromName,
        from_email: input.fromEmail,
        reply_to: input.replyTo ?? '',
        ab_test_config: input.abTestConfig ? JSON.stringify(input.abTestConfig) : '',
      },
    });
    return rowToCampaign(row);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const row = await this.client.getRow(id);
    if (!row) return null;
    return rowToCampaign(row);
  }

  async listCampaigns(options?: CampaignListOptions): Promise<{ data: Campaign[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: string; value: unknown }> = [];

    if (options?.status) {
      filters.push({ columnId: 'status', operator: 'eq', value: options.status });
    }
    if (options?.search) {
      filters.push({ columnId: 'name', operator: 'contains', value: options.search });
    }

    const result = await this.client.getRows(this.campaignsTableId, {
      limit: pageSize,
      offset,
      filters: filters as never,
    });

    return {
      data: result.items.map((r) => rowToCampaign(r)),
      total: result.total,
    };
  }

  async updateCampaign(
    id: string,
    input: UpdateCampaignInput & {
      status?: CampaignStatus;
      scheduledAt?: string;
      sentAt?: string;
      totalRecipients?: number;
      sendProvider?: string;
    },
  ): Promise<Campaign> {
    const cells: Record<string, CellValue> = {};
    if (input.name !== undefined) cells.name = input.name;
    if (input.templateId !== undefined) cells.template_id = input.templateId;
    if (input.segmentId !== undefined) cells.segment_id = input.segmentId;
    if (input.subject !== undefined) cells.subject = input.subject;
    if (input.previewText !== undefined) cells.preview_text = input.previewText;
    if (input.fromName !== undefined) cells.from_name = input.fromName;
    if (input.fromEmail !== undefined) cells.from_email = input.fromEmail;
    if (input.replyTo !== undefined) cells.reply_to = input.replyTo;
    if (input.abTestConfig !== undefined) cells.ab_test_config = JSON.stringify(input.abTestConfig);
    if (input.status !== undefined) cells.status = input.status;
    if (input.scheduledAt !== undefined) cells.scheduled_at = input.scheduledAt;
    if (input.sentAt !== undefined) cells.sent_at = input.sentAt;
    if (input.totalRecipients !== undefined) cells.total_recipients = input.totalRecipients;
    if (input.sendProvider !== undefined) cells.send_provider = input.sendProvider;

    const row = await this.client.updateRow(id, cells);
    return rowToCampaign(row);
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.client.deleteRow(id);
  }

  async createRecipient(campaignId: string, contactId: string, email: string): Promise<CampaignRecipient> {
    const row = await this.client.createRow({
      tableId: this.recipientsTableId,
      cells: {
        campaign_id: campaignId,
        contact_id: contactId,
        email,
        status: 'pending',
      },
    });
    return rowToRecipient(row);
  }

  async listRecipients(
    campaignId: string,
    options?: { status?: CampaignRecipient['status']; page?: number; pageSize?: number },
  ): Promise<{ data: CampaignRecipient[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: string; value: unknown }> = [
      { columnId: 'campaign_id', operator: 'eq', value: campaignId },
    ];

    if (options?.status) {
      filters.push({ columnId: 'status', operator: 'eq', value: options.status });
    }

    const result = await this.client.getRows(this.recipientsTableId, {
      limit: pageSize,
      offset,
      filters: filters as never,
    });

    return {
      data: result.items.map((r) => rowToRecipient(r)),
      total: result.total,
    };
  }

  async updateRecipientStatus(
    recipientId: string,
    status: CampaignRecipient['status'],
    providerMessageId?: string,
  ): Promise<void> {
    const cells: Record<string, CellValue> = { status };
    if (providerMessageId) cells.provider_message_id = providerMessageId;
    if (status === 'sent') cells.sent_at = new Date().toISOString();
    await this.client.updateRow(recipientId, cells);
  }

  async bulkCreateRecipients(
    recipients: Array<{ campaignId: string; contactId: string; email: string }>,
  ): Promise<number> {
    let created = 0;
    for (const r of recipients) {
      await this.createRecipient(r.campaignId, r.contactId, r.email);
      created++;
    }
    return created;
  }
}
