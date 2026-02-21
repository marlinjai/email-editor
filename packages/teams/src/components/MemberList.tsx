import { useState, type FormEvent } from 'react';
import type { WorkspaceMember, WorkspaceRole } from '../types';

export interface MemberListProps {
  members: WorkspaceMember[];
  currentUserId: string;
  currentUserRole: WorkspaceRole;
  onInvite: (email: string, role: WorkspaceRole) => void;
  onChangeRole: (memberId: string, newRole: WorkspaceRole) => void;
  onRemove: (memberId: string) => void;
}

const ROLES: WorkspaceRole[] = ['owner', 'admin', 'editor', 'viewer'];

export function MemberList({
  members,
  currentUserId,
  currentUserRole,
  onInvite,
  onChangeRole,
  onRemove,
}: MemberListProps) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('editor');

  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleInvite = (e: FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      onInvite(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setShowInvite(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Members ({members.length})</h3>
        {canManage && (
          <button onClick={() => setShowInvite(!showInvite)} type="button">
            {showInvite ? 'Cancel' : 'Invite Member'}
          </button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <input
            type="email"
            placeholder="Email address"
            value={inviteEmail}
            onChange={(e) =>setInviteEmail(e.target.value)}
            required
          />
          <select value={inviteRole} onChange={(e) =>setInviteRole(e.target.value as WorkspaceRole)}>
            {ROLES.filter((r) => r !== 'owner').map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="submit">Send Invite</button>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Email</th>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Role</th>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Status</th>
            {canManage && <th style={{ textAlign: 'left', padding: '8px 4px' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '8px 4px' }}>{member.name ?? '-'}</td>
              <td style={{ padding: '8px 4px' }}>{member.email}</td>
              <td style={{ padding: '8px 4px' }}>
                {canManage && member.userId !== currentUserId && member.role !== 'owner' ? (
                  <select
                    value={member.role}
                    onChange={(e) =>onChangeRole(member.id, e.target.value as WorkspaceRole)}
                  >
                    {ROLES.filter((r) => r !== 'owner').map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  member.role
                )}
              </td>
              <td style={{ padding: '8px 4px' }}>
                {member.acceptedAt ? 'Active' : 'Pending'}
              </td>
              {canManage && (
                <td style={{ padding: '8px 4px' }}>
                  {member.userId !== currentUserId && member.role !== 'owner' && (
                    <button onClick={() => onRemove(member.id)} type="button">
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
