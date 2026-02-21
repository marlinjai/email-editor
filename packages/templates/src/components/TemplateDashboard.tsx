import React from 'react';
import type { Template, TemplateStatus, TemplateListOptions } from '../types';
import type { WorkspaceRole } from '@marlinjai/email-teams';
import { PERMISSIONS } from '@marlinjai/email-teams';
import { TemplateCard } from './TemplateCard';

function hasPermission(role: WorkspaceRole, permission: string): boolean {
  const perms = PERMISSIONS[role];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  // edit implies view
  if (permission === 'template.view' && perms.includes('template.edit')) return true;
  return false;
}

export interface TemplateDashboardProps {
  templates: Template[];
  total: number;
  loading?: boolean;
  userRole?: WorkspaceRole;
  lockedTemplateIds?: Set<string>;
  onFiltersChange?: (options: TemplateListOptions) => void;
  onCreateNew?: () => void;
  onEdit?: (template: Template) => void;
  onDuplicate?: (template: Template) => void;
  onArchive?: (template: Template) => void;
  onDelete?: (template: Template) => void;
  onRequestApproval?: (template: Template) => void;
  onPageChange?: (page: number) => void;
  page?: number;
  pageSize?: number;
}

const STATUS_OPTIONS: Array<{ value: TemplateStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Newsletter', label: 'Newsletter' },
  { value: 'Transactional', label: 'Transactional' },
  { value: 'Notification', label: 'Notification' },
  { value: 'Other', label: 'Other' },
];

export function TemplateDashboard({
  templates,
  total,
  loading,
  userRole,
  lockedTemplateIds,
  onFiltersChange,
  onCreateNew,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onRequestApproval,
  onPageChange,
  page = 1,
  pageSize = 20,
}: TemplateDashboardProps) {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<TemplateStatus | ''>('');
  const [category, setCategory] = React.useState('');

  const canCreate = !userRole || hasPermission(userRole, 'template.create');
  const canDelete = !userRole || hasPermission(userRole, 'template.delete');
  const canEdit = !userRole || hasPermission(userRole, 'template.edit');
  const canApprove = !userRole || hasPermission(userRole, 'template.approve');

  const applyFilters = React.useCallback(
    (overrides?: Partial<TemplateListOptions>) => {
      onFiltersChange?.({
        search: search || undefined,
        status: (status || undefined) as TemplateStatus | undefined,
        category: category || undefined,
        page,
        pageSize,
        ...overrides,
      });
    },
    [search, status, category, page, pageSize, onFiltersChange]
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Templates</h2>
        {canCreate && (
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
            + New Template
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search templates..."
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
            const v = e.target.value as TemplateStatus | '';
            setStatus(v);
            applyFilters({ status: (v || undefined) as TemplateStatus | undefined });
          }}
          style={selectStyle}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            applyFilters({ category: e.target.value || undefined });
          }}
          style={selectStyle}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>Loading...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          No templates found.{' '}
          {canCreate && (
            <button
              onClick={onCreateNew}
              style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer' }}
            >
              Create one
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              locked={lockedTemplateIds?.has(t.id)}
              canEdit={canEdit}
              canDelete={canDelete}
              canApprove={canApprove}
              onEdit={onEdit}
              onDuplicate={canCreate ? onDuplicate : undefined}
              onArchive={onArchive}
              onDelete={onDelete}
              onRequestApproval={onRequestApproval}
            />
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

const paginationBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: 'white',
  fontSize: 14,
  cursor: 'pointer',
};
