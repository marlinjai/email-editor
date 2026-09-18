import type { MemberRole } from '@marlinjai/mail-contract';

const RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/**
 * Whether a role reaches one of the contract's access levels (`read`, `write`,
 * `admin`). Only decides what the screen offers; the service enforces the same
 * table on every call, so hiding a button is never the protection.
 */
export function can(role: MemberRole, access: 'read' | 'write' | 'admin' | 'owner'): boolean {
  const need: MemberRole = access === 'read' ? 'viewer' : access === 'write' ? 'editor' : access === 'admin' ? 'admin' : 'owner';
  return RANK[role] >= RANK[need];
}

export const ROLE_LABELS: Record<MemberRole, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Everything, including granting and removing the owner role.',
  admin: 'Settings, members, API keys, providers, webhooks and the audit log.',
  editor: 'Templates, mailings, contacts and suppressions.',
  viewer: 'Reads everything, changes nothing.',
};
