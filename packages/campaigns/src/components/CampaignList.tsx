import React, { useState, useCallback, useEffect } from 'react';
import type { Campaign, CampaignStatus, CampaignStorageAdapter, CampaignListOptions } from '../types';

export interface CampaignListProps {
  adapter: CampaignStorageAdapter;
  onSelect?: (campaign: Campaign) => void;
  onEdit?: (campaign: Campaign) => void;
  onDuplicate?: (campaign: Campaign) => void;
  onDelete?: (campaign: Campaign) => void;
  onSend?: (campaign: Campaign) => void;
  pageSize?: number;
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function CampaignList({
  adapter,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onSend,
  pageSize = 25,
}: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const options: CampaignListOptions = {
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      };
      const result = await adapter.listCampaigns(options);
      setCampaigns(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [adapter, page, pageSize, search, statusFilter]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="ec-campaign-list">
      {/* Filters */}
      <div className="ec-campaign-list__filters">
        <form onSubmit={handleSearch} className="ec-campaign-list__search">
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ec-campaign-list__search-input"
          />
          <button type="submit" className="ec-campaign-list__search-btn">
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as CampaignStatus | '');
            setPage(1);
          }}
          className="ec-campaign-list__status-filter"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <table className="ec-campaign-list__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Subject</th>
            <th>Recipients</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6} className="ec-campaign-list__loading">Loading...</td>
            </tr>
          ) : campaigns.length === 0 ? (
            <tr>
              <td colSpan={6} className="ec-campaign-list__empty">No campaigns found</td>
            </tr>
          ) : (
            campaigns.map((campaign) => (
              <tr
                key={campaign.id}
                className="ec-campaign-list__row"
                onClick={() => onSelect?.(campaign)}
              >
                <td>{campaign.name}</td>
                <td>
                  <span className={`ec-campaign-status ec-campaign-status--${campaign.status}`}>
                    {STATUS_LABELS[campaign.status]}
                  </span>
                </td>
                <td>{campaign.subject}</td>
                <td>{campaign.totalRecipients ?? '-'}</td>
                <td>{new Date(campaign.updatedAt).toLocaleDateString()}</td>
                <td className="ec-campaign-list__actions" onClick={(e) => e.stopPropagation()}>
                  {onEdit && campaign.status === 'draft' && (
                    <button onClick={() => onEdit(campaign)} className="ec-campaign-list__action-btn">
                      Edit
                    </button>
                  )}
                  {onDuplicate && (
                    <button onClick={() => onDuplicate(campaign)} className="ec-campaign-list__action-btn">
                      Duplicate
                    </button>
                  )}
                  {onSend && (campaign.status === 'draft' || campaign.status === 'scheduled') && (
                    <button onClick={() => onSend(campaign)} className="ec-campaign-list__action-btn">
                      Send
                    </button>
                  )}
                  {onDelete && campaign.status !== 'sending' && (
                    <button onClick={() => onDelete(campaign)} className="ec-campaign-list__action-btn ec-campaign-list__action-btn--danger">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ec-campaign-list__pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
