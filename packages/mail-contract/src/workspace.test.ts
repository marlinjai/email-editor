import { describe, expect, it } from 'vitest';
import {
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreated,
  AuditActor,
  AuditEntry,
  AuditQuery,
  Member,
  MemberCreate,
  MemberUpdate,
  Workspace,
  WorkspaceCreate,
  WorkspaceMembership,
  WorkspaceUpdate,
} from './workspace';
import { TS } from './test-fixtures';

const workspace = {
  id: 'ws_1',
  slug: 'opuntia',
  name: 'ŌPUNTIA',
  settings: { default_locale: 'de', locales: ['de', 'en', 'fr', 'it', 'es'], tracking_enabled: false },
  created_at: TS,
  updated_at: TS,
};

const apiKey = {
  id: 'key_1',
  name: 'Studio',
  prefix: 'mk_live_ab',
  scope: 'full',
  last_used_at: null,
  revoked_at: null,
  created_at: TS,
};

describe('workspace', () => {
  it('accepts a workspace and rejects a bad slug or empty locales', () => {
    expect(Workspace.safeParse(workspace).success).toBe(true);
    expect(Workspace.safeParse({ ...workspace, slug: 'Opuntia' }).success).toBe(false);
    expect(Workspace.safeParse({ ...workspace, settings: { ...workspace.settings, locales: [] } }).success).toBe(false);
  });

  it('WorkspaceCreate needs a slug, a name and the owner email', () => {
    const ok = { slug: 'opuntia', name: 'ŌPUNTIA', owner: { email: 'a@b.de' } };
    expect(WorkspaceCreate.safeParse(ok).success).toBe(true);
    expect(WorkspaceCreate.safeParse({ ...ok, settings: { default_locale: 'de' }, owner: { email: 'a@b.de', name: null } }).success).toBe(true);
    expect(WorkspaceCreate.safeParse({ ...ok, owner: {} }).success).toBe(false);
    expect(WorkspaceCreate.safeParse({ ...ok, slug: 'ŌPUNTIA' }).success).toBe(false);
    const { owner: _o, ...noOwner } = ok;
    expect(WorkspaceCreate.safeParse(noOwner).success).toBe(false);
  });

  it('WorkspaceMembership adds the person\'s role', () => {
    expect(WorkspaceMembership.safeParse({ ...workspace, role: 'owner' }).success).toBe(true);
    expect(WorkspaceMembership.safeParse(workspace).success).toBe(false);
  });

  it('WorkspaceUpdate needs at least one field and allows partial settings', () => {
    expect(WorkspaceUpdate.safeParse({ name: 'New' }).success).toBe(true);
    expect(WorkspaceUpdate.safeParse({ settings: { tracking_enabled: true } }).success).toBe(true);
    expect(WorkspaceUpdate.safeParse({}).success).toBe(false);
    expect(WorkspaceUpdate.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('members', () => {
  it('adds by auth-brain subject with email, accepting the four roles only', () => {
    for (const role of ['owner', 'admin', 'editor', 'viewer']) {
      expect(MemberCreate.safeParse({ subject: 'auth|1', email: 'a@b.de', role }).success, role).toBe(true);
    }
    expect(MemberCreate.safeParse({ subject: 'auth|1', email: 'a@b.de', name: null, role: 'viewer' }).success).toBe(true);
    expect(MemberCreate.safeParse({ subject: 'auth|1', email: 'a@b.de', role: 'superuser' }).success).toBe(false);
    expect(MemberCreate.safeParse({ email: 'a@b.de', role: 'viewer' }).success).toBe(false);
    expect(MemberCreate.safeParse({ subject: '', email: 'a@b.de', role: 'viewer' }).success).toBe(false);
    expect(MemberUpdate.safeParse({}).success).toBe(false);
  });

  it('accepts a member and rejects one without a subject', () => {
    const m = { id: 'mem_1', subject: 'auth|123', email: 'a@b.de', name: null, role: 'editor', created_at: TS };
    expect(Member.safeParse(m).success).toBe(true);
    expect(Member.safeParse({ ...m, subject: '' }).success).toBe(false);
  });
});

describe('api keys', () => {
  it('creates with a name, scope optional', () => {
    expect(ApiKeyCreate.safeParse({ name: 'Studio' }).success).toBe(true);
    expect(ApiKeyCreate.safeParse({ name: 'Studio', scope: 'send' }).success).toBe(true);
    expect(ApiKeyCreate.safeParse({ name: '' }).success).toBe(false);
    expect(ApiKeyCreate.safeParse({ name: 'x', scope: 'root' }).success).toBe(false);
  });

  it('a stored key never carries the plaintext; the created response does, once', () => {
    expect(ApiKey.safeParse(apiKey).success).toBe(true);
    expect('key' in ApiKey.parse({ ...apiKey, key: 'leak' })).toBe(false);
    expect(ApiKeyCreated.safeParse({ key: 'mk_live_' + 'x'.repeat(32), api_key: apiKey }).success).toBe(true);
    expect(ApiKeyCreated.safeParse({ key: 'short', api_key: apiKey }).success).toBe(false);
  });

  it('a revoked key carries revoked_at', () => {
    expect(ApiKey.safeParse({ ...apiKey, revoked_at: TS }).success).toBe(true);
    expect(ApiKey.safeParse({ ...apiKey, revoked_at: 'now' }).success).toBe(false);
  });
});

describe('audit log', () => {
  it('accepts each actor type and rejects an unknown one', () => {
    expect(AuditActor.safeParse({ type: 'member', member_id: 'm', subject: 's' }).success).toBe(true);
    expect(AuditActor.safeParse({ type: 'api_key', api_key_id: 'k' }).success).toBe(true);
    expect(AuditActor.safeParse({ type: 'system', reason: 'hosted unsubscribe page' }).success).toBe(true);
    expect(AuditActor.safeParse({ type: 'robot' }).success).toBe(false);
    expect(AuditActor.safeParse({ type: 'member', member_id: 'm' }).success).toBe(false);
  });

  it('accepts an entry with a known action only', () => {
    const e = {
      id: 'aud_1',
      action: 'contact.erased',
      actor: { type: 'api_key', api_key_id: 'k' },
      target_type: 'contact',
      target_id: 'ctc_1',
      details: {},
      created_at: TS,
    };
    expect(AuditEntry.safeParse(e).success).toBe(true);
    expect(AuditEntry.safeParse({ ...e, action: 'contact.hugged' }).success).toBe(false);
    expect(AuditQuery.safeParse({ action: 'api_key.revoked', limit: '10' }).success).toBe(true);
    expect(AuditQuery.safeParse({ action: 'nope' }).success).toBe(false);
  });
});
