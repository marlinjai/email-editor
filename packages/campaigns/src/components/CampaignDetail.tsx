import React, { useState, useEffect, useCallback } from 'react';
import type { Campaign, CampaignRecipient, CampaignStorageAdapter } from '../types';

export interface CampaignDetailProps {
  adapter: CampaignStorageAdapter;
  campaignId: string;
  onBack?: () => void;
  onCancel?: (campaign: Campaign) => void;
}

const STATUS_LABELS: Record<CampaignRecipient['status'], string> = {
  pending: 'Pending',
  sent: 'Sent',
  delivered: 'Delivered',
  bounced: 'Bounced',
  failed: 'Failed',
};

export function CampaignDetail({
  adapter,
  campaignId,
  onBack,
  onCancel,
}: CampaignDetailProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  const loadCampaign = useCallback(async () => {
    const c = await adapter.getCampaign(campaignId);
    setCampaign(c);
  }, [adapter, campaignId]);

  const loadRecipients = useCallback(async () => {
    const result = await adapter.listRecipients(campaignId, {
      page: recipientPage,
      pageSize,
    });
    setRecipients(result.data);
    setRecipientTotal(result.total);
  }, [adapter, campaignId, recipientPage]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadCampaign(), loadRecipients()]).finally(() => setLoading(false));
  }, [loadCampaign, loadRecipients]);

  if (loading) {
    return <div className="ec-campaign-detail__loading">Loading...</div>;
  }

  if (!campaign) {
    return <div className="ec-campaign-detail__not-found">Campaign not found</div>;
  }

  const recipientPages = Math.ceil(recipientTotal / pageSize);

  return (
    <div className="ec-campaign-detail">
      {/* Header */}
      <div className="ec-campaign-detail__header">
        {onBack && (
          <button onClick={onBack} className="ec-campaign-detail__back-btn">
            Back
          </button>
        )}
        <h2 className="ec-campaign-detail__title">{campaign.name}</h2>
        <span className={`ec-campaign-status ec-campaign-status--${campaign.status}`}>
          {campaign.status}
        </span>
      </div>

      {/* Campaign Info */}
      <div className="ec-campaign-detail__info">
        <dl>
          <dt>Subject</dt>
          <dd>{campaign.subject}</dd>
          <dt>From</dt>
          <dd>{campaign.fromName} &lt;{campaign.fromEmail}&gt;</dd>
          {campaign.replyTo && (
            <>
              <dt>Reply-To</dt>
              <dd>{campaign.replyTo}</dd>
            </>
          )}
          {campaign.scheduledAt && (
            <>
              <dt>Scheduled At</dt>
              <dd>{new Date(campaign.scheduledAt).toLocaleString()}</dd>
            </>
          )}
          {campaign.sentAt && (
            <>
              <dt>Sent At</dt>
              <dd>{new Date(campaign.sentAt).toLocaleString()}</dd>
            </>
          )}
          <dt>Total Recipients</dt>
          <dd>{campaign.totalRecipients ?? 0}</dd>
        </dl>
      </div>

      {/* Cancel Action */}
      {onCancel && (campaign.status === 'scheduled' || campaign.status === 'sending') && (
        <div className="ec-campaign-detail__actions">
          <button onClick={() => onCancel(campaign)} className="ec-campaign-detail__cancel-btn">
            Cancel Campaign
          </button>
        </div>
      )}

      {/* Recipients */}
      <div className="ec-campaign-detail__recipients">
        <h3>Recipients ({recipientTotal})</h3>
        <table className="ec-campaign-detail__recipients-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>Sent At</th>
              <th>Provider ID</th>
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={4} className="ec-campaign-detail__no-recipients">
                  No recipients yet
                </td>
              </tr>
            ) : (
              recipients.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>
                    <span className={`ec-recipient-status ec-recipient-status--${r.status}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td>{r.sentAt ? new Date(r.sentAt).toLocaleString() : '-'}</td>
                  <td>{r.providerMessageId ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {recipientPages > 1 && (
          <div className="ec-campaign-detail__pagination">
            <button disabled={recipientPage <= 1} onClick={() => setRecipientPage(recipientPage - 1)}>
              Previous
            </button>
            <span>Page {recipientPage} of {recipientPages}</span>
            <button disabled={recipientPage >= recipientPages} onClick={() => setRecipientPage(recipientPage + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
