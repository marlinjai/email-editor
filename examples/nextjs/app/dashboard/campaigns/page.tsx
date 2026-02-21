'use client';

import { CampaignList } from '@marlinjai/email-campaigns/react';
import type { CampaignStorageAdapter, Campaign, CampaignListOptions } from '@marlinjai/email-campaigns/react';

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp1',
    name: 'February Newsletter',
    templateId: 't2',
    status: 'sent',
    subject: 'Your February Update',
    fromName: 'Email Platform',
    fromEmail: 'hello@example.com',
    totalRecipients: 3612,
    sentAt: '2026-02-18T10:00:00Z',
    createdAt: '2026-02-15T09:00:00Z',
    updatedAt: '2026-02-18T10:05:00Z',
  },
  {
    id: 'camp2',
    name: 'Product Launch Announcement',
    templateId: 't3',
    status: 'scheduled',
    subject: 'Introducing our new feature',
    fromName: 'Email Platform',
    fromEmail: 'hello@example.com',
    scheduledAt: '2026-02-25T14:00:00Z',
    createdAt: '2026-02-20T11:00:00Z',
    updatedAt: '2026-02-20T11:30:00Z',
  },
  {
    id: 'camp3',
    name: 'Welcome Series - Day 1',
    templateId: 't1',
    status: 'sent',
    subject: 'Welcome aboard!',
    fromName: 'Email Platform',
    fromEmail: 'hello@example.com',
    totalRecipients: 124,
    sentAt: '2026-02-19T08:00:00Z',
    createdAt: '2026-01-10T12:00:00Z',
    updatedAt: '2026-02-19T08:02:00Z',
  },
  {
    id: 'camp4',
    name: 'March Campaign Draft',
    templateId: 't2',
    status: 'draft',
    subject: 'March Update Coming Soon',
    fromName: 'Email Platform',
    fromEmail: 'hello@example.com',
    createdAt: '2026-02-21T09:00:00Z',
    updatedAt: '2026-02-21T09:00:00Z',
  },
];

const mockAdapter: CampaignStorageAdapter = {
  listCampaigns: async (_options?: CampaignListOptions) => ({
    data: MOCK_CAMPAIGNS,
    total: MOCK_CAMPAIGNS.length,
  }),
  getCampaign: async (id: string) => MOCK_CAMPAIGNS.find((c) => c.id === id) ?? null,
  createCampaign: async () => MOCK_CAMPAIGNS[0]!,
  updateCampaign: async () => MOCK_CAMPAIGNS[0]!,
  deleteCampaign: async () => {},
  createRecipient: async () => ({ id: 'r1', campaignId: 'camp1', contactId: 'c1', email: 'test@example.com', status: 'pending' as const, createdAt: '' }),
  listRecipients: async () => ({ data: [], total: 0 }),
  updateRecipientStatus: async () => {},
  bulkCreateRecipients: async () => 0,
};

export default function CampaignsPage() {
  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Campaigns</h1>
        <p>Create, schedule, and track email campaigns</p>
      </div>
      <div className="dashboard-section">
        <CampaignList adapter={mockAdapter} />
      </div>
    </div>
  );
}
