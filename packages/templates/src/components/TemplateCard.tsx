import React from 'react';
import type { Template, TemplateStatus } from '../types';

export interface TemplateCardProps {
  template: Template;
  locked?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canApprove?: boolean;
  onEdit?: (template: Template) => void;
  onDuplicate?: (template: Template) => void;
  onArchive?: (template: Template) => void;
  onDelete?: (template: Template) => void;
  onRequestApproval?: (template: Template) => void;
}

const STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

const STATUS_COLORS: Record<TemplateStatus, string> = {
  draft: '#94a3b8',
  active: '#22c55e',
  archived: '#f97316',
};

export function TemplateCard({
  template,
  locked = false,
  canEdit = true,
  canDelete = true,
  canApprove = false,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onRequestApproval,
}: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleCardClick = () => {
    if (locked && !canApprove) return;
    onEdit?.(template);
  };

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: locked ? 'default' : 'pointer',
        transition: 'box-shadow 0.15s',
        opacity: locked && !canApprove ? 0.8 : 1,
      }}
      onClick={handleCardClick}
      onMouseEnter={(e) => {
        if (!locked) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Thumbnail area */}
      <div
        style={{
          height: 160,
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: 14,
          position: 'relative',
        }}
      >
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          'No preview'
        )}
        {locked && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: '#7c3aed',
              color: 'white',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Approved
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{template.name}</h3>
            {locked && (
              <span
                style={{ fontSize: 14 }}
                title="This template is locked (approved)"
              >
                &#128274;
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                fontSize: 16,
              }}
              aria-label="Template actions"
            >
              ...
            </button>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  minWidth: 140,
                }}
              >
                {canEdit && !locked && (
                  <button
                    style={menuItemStyle}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit?.(template); }}
                  >
                    Edit
                  </button>
                )}
                {locked && (
                  <button
                    style={{ ...menuItemStyle, color: '#94a3b8', cursor: 'default' }}
                    onClick={(e) => e.stopPropagation()}
                    disabled
                  >
                    Edit (locked)
                  </button>
                )}
                {onDuplicate && (
                  <button
                    style={menuItemStyle}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDuplicate(template); }}
                  >
                    Duplicate
                  </button>
                )}
                {canEdit && !locked && template.status !== 'archived' && (
                  <button
                    style={menuItemStyle}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive?.(template); }}
                  >
                    Archive
                  </button>
                )}
                {canEdit && !locked && onRequestApproval && (
                  <button
                    style={{ ...menuItemStyle, color: '#7c3aed' }}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRequestApproval(template); }}
                  >
                    Request Approval
                  </button>
                )}
                {canDelete && (
                  <button
                    style={{ ...menuItemStyle, color: '#ef4444' }}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete?.(template); }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: STATUS_COLORS[template.status] + '20',
              color: STATUS_COLORS[template.status],
            }}
          >
            {STATUS_LABELS[template.status]}
          </span>
          {template.category && (
            <span style={{ fontSize: 11, color: '#64748b' }}>{template.category}</span>
          )}
        </div>

        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#94a3b8' }}>
          Updated {new Date(template.updatedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  background: 'none',
  textAlign: 'left' as const,
  cursor: 'pointer',
  fontSize: 13,
};
