import { useState } from 'react';
import type { WorkspaceRole } from '../types';

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onSwitch: (workspaceId: string) => void;
  onCreateWorkspace?: () => void;
  loading?: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  onSwitch,
  onCreateWorkspace,
  loading = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);

  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  const handleSelect = (id: string) => {
    if (id !== currentWorkspaceId) {
      onSwitch(id);
    }
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: 14,
          fontWeight: 500,
          minWidth: 180,
        }}
        aria-label="Switch workspace"
        aria-expanded={open}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.name : 'Select workspace'}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          {open ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 50,
            maxHeight: 240,
            overflowY: 'auto',
          }}
          role="listbox"
          aria-label="Workspaces"
        >
          {workspaces.length === 0 ? (
            <div style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>
              No workspaces
            </div>
          ) : (
            workspaces.map((ws) => (
              <button
                key={ws.id}
                role="option"
                aria-selected={ws.id === currentWorkspaceId}
                onClick={() => handleSelect(ws.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: ws.id === currentWorkspaceId ? '#f1f5f9' : 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: ws.id === currentWorkspaceId ? 600 : 400 }}>
                  {ws.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: '#94a3b8',
                    textTransform: 'capitalize',
                  }}
                >
                  {ws.role}
                </span>
              </button>
            ))
          )}

          {onCreateWorkspace && (
            <>
              <div style={{ borderTop: '1px solid #e2e8f0' }} />
              <button
                onClick={() => {
                  setOpen(false);
                  onCreateWorkspace();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                  color: '#3b82f6',
                  fontWeight: 500,
                }}
              >
                + New Workspace
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
