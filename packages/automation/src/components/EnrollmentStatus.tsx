import React, { useState } from 'react';
import type { Enrollment, EnrollmentStatus as EnrollmentStatusType, EnrollmentListOptions, AutomationStep } from '../types';

export interface EnrollmentStatusProps {
  enrollments: Enrollment[];
  total: number;
  steps?: AutomationStep[];
  loading?: boolean;
  onFiltersChange?: (options: EnrollmentListOptions) => void;
  onExitEnrollment?: (enrollmentId: string) => void;
  onPageChange?: (page: number) => void;
  page?: number;
  pageSize?: number;
}

const STATUS_LABELS: Record<EnrollmentStatusType, string> = {
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
  exited: 'Exited',
};

const STATUS_COLORS: Record<EnrollmentStatusType, string> = {
  active: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444',
  paused: '#f59e0b',
  exited: '#94a3b8',
};

export function EnrollmentStatusView({
  enrollments,
  total,
  steps,
  loading,
  onFiltersChange,
  onExitEnrollment,
  onPageChange,
  page = 1,
  pageSize = 20,
}: EnrollmentStatusProps) {
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatusType | ''>('');

  const totalPages = Math.ceil(total / pageSize);

  const stepMap = new Map(steps?.map((s) => [s.id, s]) ?? []);

  const getStepLabel = (stepId?: string): string => {
    if (!stepId) return '-';
    const step = stepMap.get(stepId);
    if (!step) return stepId.slice(0, 8);
    return `Step ${step.position + 1}: ${step.config.type}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Enrollments ({total})
        </h3>
        <select
          value={statusFilter}
          onChange={(e) => {
            const v = e.target.value as EnrollmentStatusType | '';
            setStatusFilter(v);
            onFiltersChange?.({
              status: (v || undefined) as EnrollmentStatusType | undefined,
              page,
              pageSize,
            });
          }}
          style={selectStyle}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="paused">Paused</option>
          <option value="exited">Exited</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Loading...</div>
      ) : enrollments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
          No enrollments found
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Contact ID</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Current Step</th>
              <th style={thStyle}>Enrolled At</th>
              <th style={thStyle}>Next Action</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((enrollment) => (
              <tr key={enrollment.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {enrollment.contactId.slice(0, 12)}...
                  </span>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 500,
                      background: STATUS_COLORS[enrollment.status] + '20',
                      color: STATUS_COLORS[enrollment.status],
                    }}
                  >
                    {STATUS_LABELS[enrollment.status]}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12 }}>
                    {getStepLabel(enrollment.currentStepId)}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {new Date(enrollment.enterredAt).toLocaleDateString()}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {enrollment.nextActionAt
                      ? new Date(enrollment.nextActionAt).toLocaleString()
                      : '-'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {enrollment.status === 'active' && onExitEnrollment && (
                    <button
                      onClick={() => onExitEnrollment(enrollment.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #e2e8f0',
                        borderRadius: 4,
                        padding: '2px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: '#ef4444',
                      }}
                    >
                      Exit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} style={paginationBtnStyle}>
            Previous
          </button>
          <span style={{ padding: '8px 12px', fontSize: 13, color: '#64748b' }}>
            Page {page} of {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)} style={paginationBtnStyle}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 13,
  background: 'white',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 4px',
  fontSize: 12,
  color: '#64748b',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '8px 4px',
};

const paginationBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: 'white',
  fontSize: 13,
  cursor: 'pointer',
};
