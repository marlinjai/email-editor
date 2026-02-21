import { useState } from 'react';
import type { ApprovalRequest, ApprovalResourceType } from '../types';

export interface ApprovalQueueProps {
  approvals: ApprovalRequest[];
  onApprove: (approvalId: string, note?: string) => void;
  onReject: (approvalId: string, note?: string) => void;
  filterType?: ApprovalResourceType;
  onFilterChange?: (type: ApprovalResourceType | undefined) => void;
}

export function ApprovalQueue({
  approvals,
  onApprove,
  onReject,
  filterType,
  onFilterChange,
}: ApprovalQueueProps) {
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const filtered = filterType
    ? approvals.filter((a) => a.resourceType === filterType)
    : approvals;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Pending Approvals ({filtered.length})</h3>
        {onFilterChange && (
          <select
            value={filterType ?? ''}
            onChange={(e) =>
              onFilterChange(e.target.value ? (e.target.value as ApprovalResourceType) : undefined)
            }
          >
            <option value="">All types</option>
            <option value="template">Templates</option>
            <option value="campaign">Campaigns</option>
          </select>
        )}
      </div>

      {filtered.length === 0 && <p>No pending approvals.</p>}

      {filtered.map((approval) => (
        <div
          key={approval.id}
          style={{
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>
              <strong>{approval.resourceType}</strong>: {approval.resourceId}
            </span>
            <span style={{ color: '#666', fontSize: '0.9em' }}>
              {new Date(approval.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div style={{ fontSize: '0.9em', color: '#666', marginBottom: 8 }}>
            Requested by: {approval.requestedBy}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Optional note..."
              value={noteMap[approval.id] ?? ''}
              onChange={(e) =>
                setNoteMap((prev) => ({ ...prev, [approval.id]: e.target.value }))
              }
              style={{ flex: 1 }}
            />
            <button
              onClick={() => onApprove(approval.id, noteMap[approval.id])}
              type="button"
              style={{ color: 'green' }}
            >
              Approve
            </button>
            <button
              onClick={() => onReject(approval.id, noteMap[approval.id])}
              type="button"
              style={{ color: 'red' }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
