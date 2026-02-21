import React, { useState } from 'react';
import type { Automation, AutomationStatus, AutomationListOptions } from '../types';

export interface AutomationListProps {
  automations: Automation[];
  total: number;
  loading?: boolean;
  onFiltersChange?: (options: AutomationListOptions) => void;
  onCreateNew?: () => void;
  onEdit?: (automation: Automation) => void;
  onActivate?: (automation: Automation) => void;
  onPause?: (automation: Automation) => void;
  onDelete?: (automation: Automation) => void;
  onPageChange?: (page: number) => void;
  page?: number;
  pageSize?: number;
}

const STATUS_LABELS: Record<AutomationStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
};

const STATUS_COLORS: Record<AutomationStatus, string> = {
  draft: '#94a3b8',
  active: '#22c55e',
  paused: '#f59e0b',
  archived: '#64748b',
};

const TRIGGER_LABELS: Record<string, string> = {
  event: 'Event-based',
  schedule: 'Scheduled',
  manual: 'Manual',
};

export function AutomationList({
  automations,
  total,
  loading,
  onFiltersChange,
  onCreateNew,
  onEdit,
  onActivate,
  onPause,
  onDelete,
  onPageChange,
  page = 1,
  pageSize = 20,
}: AutomationListProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AutomationStatus | ''>('');

  const totalPages = Math.ceil(total / pageSize);

  const applyFilters = (overrides?: Partial<AutomationListOptions>) => {
    onFiltersChange?.({
      search: search || undefined,
      status: (status || undefined) as AutomationStatus | undefined,
      page,
      pageSize,
      ...overrides,
    });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Automations</h2>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + New Automation
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search automations..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            applyFilters({ search: e.target.value || undefined });
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            fontSize: 14,
            flex: 1,
            minWidth: 200,
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            const v = e.target.value as AutomationStatus | '';
            setStatus(v);
            applyFilters({ status: (v || undefined) as AutomationStatus | undefined });
          }}
          style={selectStyle}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading...</div>
      ) : automations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          No automations found.{' '}
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer' }}
            >
              Create one
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {automations.map((automation) => (
            <div
              key={automation.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: 16,
                cursor: onEdit ? 'pointer' : 'default',
                transition: 'box-shadow 0.15s',
              }}
              onClick={() => onEdit?.(automation)}
              onMouseEnter={(e) => {
                if (onEdit) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
                    {automation.name}
                  </h3>
                  {automation.description && (
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b' }}>
                      {automation.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 9999,
                        fontSize: 11,
                        fontWeight: 500,
                        background: STATUS_COLORS[automation.status] + '20',
                        color: STATUS_COLORS[automation.status],
                      }}
                    >
                      {STATUS_LABELS[automation.status]}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {TRIGGER_LABELS[automation.trigger.type] ?? automation.trigger.type}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {automation.totalEnrolled} enrolled
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {automation.totalCompleted} completed
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  {automation.status === 'draft' || automation.status === 'paused' ? (
                    onActivate && (
                      <button onClick={() => onActivate(automation)} style={actionBtnStyle}>
                        Activate
                      </button>
                    )
                  ) : automation.status === 'active' ? (
                    onPause && (
                      <button onClick={() => onPause(automation)} style={actionBtnStyle}>
                        Pause
                      </button>
                    )
                  ) : null}
                  {onDelete && automation.status !== 'active' && (
                    <button
                      onClick={() => onDelete(automation)}
                      style={{ ...actionBtnStyle, color: '#ef4444' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
          <button
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
            style={paginationBtnStyle}
          >
            Previous
          </button>
          <span style={{ padding: '8px 12px', fontSize: 14, color: '#64748b' }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
            style={paginationBtnStyle}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 14,
  background: 'white',
};

const actionBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
  color: '#3b82f6',
};

const paginationBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: 'white',
  fontSize: 14,
  cursor: 'pointer',
};
