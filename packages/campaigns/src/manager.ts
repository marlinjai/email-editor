import { z } from 'zod';
import type {
  Campaign,
  CampaignListOptions,
  CampaignStorageAdapter,
  CreateCampaignInput,
  UpdateCampaignInput,
  ScheduleCampaignInput,
  SendAdapter,
  SendResult,
} from './types';
import type { ContactStorageAdapter } from '@marlinjai/email-contacts';
import type { TemplateStorageAdapter } from '@marlinjai/email-templates';
import { injectTrackingPixel, rewriteLinksForTracking } from './tracking';
import { toUTCScheduledTime } from './scheduler';
import { resolveMergeFields } from '@marlinjai/email-contacts';

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(255),
  templateId: z.string().min(1, 'Template ID is required'),
  segmentId: z.string().optional(),
  subject: z.string().min(1, 'Subject is required').max(998),
  previewText: z.string().max(500).optional(),
  fromName: z.string().min(1, 'From name is required').max(255),
  fromEmail: z.string().email('Valid email required'),
  replyTo: z.string().email().optional(),
  abTestConfig: z
    .object({
      enabled: z.boolean(),
      variants: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          subject: z.string().optional(),
          templateId: z.string().optional(),
          percentage: z.number().min(0).max(100),
        }),
      ),
      winnerCriteria: z.enum(['open_rate', 'click_rate']),
      testPercentage: z.number().min(1).max(100),
      testDurationHours: z.number().min(1),
    })
    .optional(),
});

const BATCH_SIZE = 50;

export interface CampaignManagerConfig {
  adapter: CampaignStorageAdapter;
  contactAdapter: ContactStorageAdapter;
  templateAdapter: TemplateStorageAdapter;
  sendAdapter: SendAdapter;
  trackingBaseUrl?: string;
  /** Function to compile template JSON to HTML. Import from @marlinjai/email-editor-core/server */
  compileTemplate?: (templateJson: string) => { html: string; errors?: string[] };
}

export class CampaignManager {
  private readonly adapter: CampaignStorageAdapter;
  private readonly contactAdapter: ContactStorageAdapter;
  private readonly templateAdapter: TemplateStorageAdapter;
  private readonly sendAdapter: SendAdapter;
  private readonly trackingBaseUrl: string;
  private readonly compileTemplate?: (templateJson: string) => { html: string; errors?: string[] };

  constructor(config: CampaignManagerConfig) {
    this.adapter = config.adapter;
    this.contactAdapter = config.contactAdapter;
    this.templateAdapter = config.templateAdapter;
    this.sendAdapter = config.sendAdapter;
    this.trackingBaseUrl = config.trackingBaseUrl ?? '';
    this.compileTemplate = config.compileTemplate;
  }

  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    const validated = createCampaignSchema.parse(input);
    return this.adapter.createCampaign(validated);
  }

  async updateCampaign(id: string, updates: UpdateCampaignInput): Promise<Campaign> {
    const campaign = await this.adapter.getCampaign(id);
    if (!campaign) throw new Error(`Campaign ${id} not found`);
    if (campaign.status !== 'draft') {
      throw new Error('Only draft campaigns can be updated');
    }
    return this.adapter.updateCampaign(id, updates);
  }

  async deleteCampaign(id: string): Promise<void> {
    const campaign = await this.adapter.getCampaign(id);
    if (!campaign) throw new Error(`Campaign ${id} not found`);
    if (campaign.status === 'sending') {
      throw new Error('Cannot delete a campaign that is currently sending');
    }
    return this.adapter.deleteCampaign(id);
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    return this.adapter.getCampaign(id);
  }

  async listCampaigns(options?: CampaignListOptions): Promise<{ data: Campaign[]; total: number }> {
    return this.adapter.listCampaigns(options);
  }

  async scheduleCampaign(id: string, scheduleInput: ScheduleCampaignInput): Promise<Campaign> {
    const campaign = await this.adapter.getCampaign(id);
    if (!campaign) throw new Error(`Campaign ${id} not found`);
    if (campaign.status !== 'draft') {
      throw new Error('Only draft campaigns can be scheduled');
    }

    const scheduledAt = toUTCScheduledTime(scheduleInput.scheduledAt, scheduleInput.timezone);
    return this.adapter.updateCampaign(id, { status: 'scheduled', scheduledAt });
  }

  async cancelCampaign(id: string): Promise<Campaign> {
    const campaign = await this.adapter.getCampaign(id);
    if (!campaign) throw new Error(`Campaign ${id} not found`);
    if (campaign.status !== 'scheduled' && campaign.status !== 'sending') {
      throw new Error('Only scheduled or sending campaigns can be cancelled');
    }
    return this.adapter.updateCampaign(id, { status: 'cancelled' });
  }

  async sendTestEmail(campaignId: string, testEmail: string): Promise<SendResult> {
    const campaign = await this.adapter.getCampaign(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const html = await this.compileCampaignHtml(campaign);

    return this.sendAdapter.send({
      to: testEmail,
      from: { name: campaign.fromName, email: campaign.fromEmail },
      replyTo: campaign.replyTo,
      subject: `[TEST] ${campaign.subject}`,
      html,
    });
  }

  async sendCampaign(id: string): Promise<Campaign> {
    const campaign = await this.adapter.getCampaign(id);
    if (!campaign) throw new Error(`Campaign ${id} not found`);
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new Error('Campaign must be in draft or scheduled status to send');
    }

    // 1. Mark as sending
    await this.adapter.updateCampaign(id, { status: 'sending' });

    try {
      // 2. Get contacts
      const contacts = campaign.segmentId
        ? (await this.contactAdapter.getSegmentContacts(campaign.segmentId, { pageSize: 10000 })).data
        : (await this.contactAdapter.listContacts({ pageSize: 10000 })).data;

      // Filter to active contacts only
      const activeContacts = contacts.filter((c) => c.status === 'active');

      // 3. Create recipients
      await this.adapter.bulkCreateRecipients(
        activeContacts.map((c) => ({ campaignId: id, contactId: c.id, email: c.email })),
      );

      // 4. Compile template
      const baseHtml = await this.compileCampaignHtml(campaign);

      // 5. Send in batches
      let totalSent = 0;
      let totalFailed = 0;

      for (let i = 0; i < activeContacts.length; i += BATCH_SIZE) {
        const batch = activeContacts.slice(i, i + BATCH_SIZE);
        const messages = batch.map((contact) => {
          let html = resolveMergeFields(baseHtml, contact);

          if (this.trackingBaseUrl) {
            html = injectTrackingPixel(html, id, contact.id, this.trackingBaseUrl);
            html = rewriteLinksForTracking(html, id, contact.id, this.trackingBaseUrl);
          }

          return {
            to: contact.email,
            from: { name: campaign.fromName, email: campaign.fromEmail },
            replyTo: campaign.replyTo,
            subject: resolveMergeFields(campaign.subject, contact),
            html,
          };
        });

        const result = await this.sendAdapter.sendBatch({ messages });
        totalSent += result.totalSent;
        totalFailed += result.totalFailed;
      }

      // 6. Update campaign status
      return this.adapter.updateCampaign(id, {
        status: totalFailed === activeContacts.length ? 'failed' : 'sent',
        sentAt: new Date().toISOString(),
        totalRecipients: activeContacts.length,
      });
    } catch (error) {
      await this.adapter.updateCampaign(id, { status: 'failed' });
      throw error;
    }
  }

  private async compileCampaignHtml(campaign: Campaign): Promise<string> {
    const template = await this.templateAdapter.getTemplate(campaign.templateId);
    if (!template) throw new Error(`Template ${campaign.templateId} not found`);

    if (this.compileTemplate) {
      const result = this.compileTemplate(template.templateJson);
      if (result.errors && result.errors.length > 0) {
        throw new Error(`Template compilation errors: ${result.errors.join(', ')}`);
      }
      return result.html;
    }

    // Fallback: return templateJson as-is (assumes it's already HTML)
    return template.templateJson;
  }
}
