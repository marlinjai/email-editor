import { useState } from 'react';
import type { AuditLogEntry, AuditLogQueryOptions } from '../types';

export interface AuditLogViewerProps {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  onQueryChange: (options: AuditLogQueryOptions) => void;
}

export function AuditLogViewer({
  entries,
  total,
  page,
  pageSize,
  onQueryChange,
}: AuditLogViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const totalPages = Math.ceil(total / pageSize);

  const applyFilters = () => {
    onQueryChange({
      userId: filterUser || undefined,
      action: filterAction || undefined,
      startDate: filterStartDate || undefined,
      endDate: filterEndDate || undefined,
      page: 1,
      pageSize,
    });
  };

  const clearFilters = () => {
    setFilterUser('');
    setFilterAction('');
    setFilterStartDate('');
    setFilterEndDate('');
    onQueryChange({ page: 1, pageSize });
  };

  return (
    <div>
      <h3>Audit Log</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Filter by user ID"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filter by action"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        />
        <input
          type="date"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
        />
        <input
          type="date"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
        />
        <button onClick={applyFilters} type="button">Filter</button>
        <button onClick={clearFilters} type="button">Clear</button>
      </div>

      {entries.length === 0 && <p>No audit log entries found.</p>}

      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{
            borderBottom: '1px solid #eee',
            padding: '8px 0',
            cursor: entry.details ? 'pointer' : 'default',
          }}
          onClick={() => entry.details && setExpandedId(expandedId === entry.id ? null : entry.id)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              <strong>{entry.action}</strong> on {entry.resourceType}/{entry.resourceId}
            </span>
            <span style={{ color: '#666', fontSize: '0.9em' }}>
              {new Date(entry.occurredAt).toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            User: {entry.userId}
          </div>
          {expandedId === entry.id && entry.details && (
            <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: '0.85em', overflow: 'auto' }}>
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          )}
        </div>
      ))}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => onQueryChange({ page: page - 1, pageSize })}
            type="button"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onQueryChange({ page: page + 1, pageSize })}
            type="button"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
