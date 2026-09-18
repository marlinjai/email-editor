import { z } from 'zod';
import { Email, Id, PageQuery, Slug, Timestamp } from './common';

/*
 * S0, the foundation: workspaces, members, API keys and the audit log.
 */

// Workspaces

export const WorkspaceSettings = z.object({
  /** Default language of the hosted unsubscribe page (BCP 47 tag, e.g. "de"). */
  default_locale: z.string().min(2).max(35),
  /** Languages the hosted pages are offered in. Includes `default_locale`. */
  locales: z.array(z.string().min(2).max(35)).min(1).max(20),
  /** Open and click tracking. Off by default, opt-in per workspace. */
  tracking_enabled: z.boolean(),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

export const Workspace = z.object({
  id: Id,
  slug: Slug,
  name: z.string().min(1).max(120),
  settings: WorkspaceSettings,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Workspace = z.infer<typeof Workspace>;

/**
 * Creating a workspace (dashboard only). The signed-in person named by
 * `x-mail-subject` becomes its owner; the dashboard supplies their email and
 * name, because the service never talks to auth-brain itself.
 */
export const WorkspaceCreate = z.object({
  slug: Slug,
  name: z.string().min(1).max(120),
  settings: WorkspaceSettings.partial().optional(),
  owner: z.object({
    email: Email,
    name: z.string().max(200).nullable().optional(),
  }),
});
export type WorkspaceCreate = z.infer<typeof WorkspaceCreate>;

export const WorkspaceUpdate = z
  .object({
    name: z.string().min(1).max(120),
    settings: WorkspaceSettings.partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type WorkspaceUpdate = z.infer<typeof WorkspaceUpdate>;

// Members (humans, signed in through auth-brain)

/** The same roles as the teams package: owner, admin, editor, viewer. */
export const MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export const MemberRole = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof MemberRole>;

/** A workspace as listed for the signed-in person, with their role in it. */
export const WorkspaceMembership = Workspace.extend({ role: MemberRole });
export type WorkspaceMembership = z.infer<typeof WorkspaceMembership>;

export const Member = z.object({
  id: Id,
  /** The person's auth-brain subject. */
  subject: z.string().min(1).max(255),
  email: Email,
  name: z.string().max(200).nullable(),
  role: MemberRole,
  created_at: Timestamp,
});
export type Member = z.infer<typeof Member>;

/**
 * Adding a member. The service binds people by auth-brain subject only (it never
 * sees a login), so the dashboard resolves the person first and sends the subject
 * with their email and name. The same subject twice is `already_exists` (409).
 */
export const MemberCreate = z.object({
  subject: z.string().min(1).max(255),
  email: Email,
  name: z.string().max(200).nullable().optional(),
  role: MemberRole,
});
export type MemberCreate = z.infer<typeof MemberCreate>;

/**
 * Changing a role. Only an owner may grant or revoke `owner`, and the last owner
 * cannot be demoted or removed (`last_owner`, 409).
 */
export const MemberUpdate = z.object({ role: MemberRole });
export type MemberUpdate = z.infer<typeof MemberUpdate>;

// API keys (clients)

/** What a key may do. `send` covers contacts, mailings and suppressions. */
export const API_KEY_SCOPES = ['full', 'read', 'send'] as const;
export const ApiKeyScope = z.enum(API_KEY_SCOPES);
export type ApiKeyScope = z.infer<typeof ApiKeyScope>;

/** A key as stored: the plaintext is never returned after creation. */
export const ApiKey = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  /** The first characters of the key, for recognising it in a list. */
  prefix: z.string().min(4).max(32),
  scope: ApiKeyScope,
  last_used_at: Timestamp.nullable(),
  revoked_at: Timestamp.nullable(),
  created_at: Timestamp,
});
export type ApiKey = z.infer<typeof ApiKey>;

export const ApiKeyCreate = z.object({
  name: z.string().min(1).max(120),
  /** Omitted means `full`. */
  scope: ApiKeyScope.optional(),
});
export type ApiKeyCreate = z.infer<typeof ApiKeyCreate>;

/** The only response that carries the plaintext key. Shown once. */
export const ApiKeyCreated = z.object({
  key: z.string().min(20),
  api_key: ApiKey,
});
export type ApiKeyCreated = z.infer<typeof ApiKeyCreated>;

// Audit log

export const AUDIT_ACTIONS = [
  'workspace.created',
  'workspace.updated',
  'member.added',
  'member.role_changed',
  'member.removed',
  'api_key.created',
  'api_key.revoked',
  'provider.created',
  'provider.updated',
  'provider.deleted',
  'topic.created',
  'topic.updated',
  'template.created',
  'template.updated',
  'template.deleted',
  'contact.erased',
  'suppression.created',
  'suppression.deleted',
  'mailing.created',
  'mailing.sent',
  'mailing.paused',
  'mailing.resumed',
  'mailing.cancelled',
  'mailing.retried',
  'webhook.created',
  'webhook.updated',
  'webhook.deleted',
  'webhook.secret_rotated',
  'contact.unsubscribed',
] as const;
export const AuditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditActor = z.discriminatedUnion('type', [
  z.object({ type: z.literal('member'), member_id: Id, subject: z.string().min(1) }),
  z.object({ type: z.literal('api_key'), api_key_id: Id }),
  /** The service itself (the worker, a bounce, the hosted unsubscribe page). */
  z.object({ type: z.literal('system'), reason: z.string().min(1).max(200) }),
]);
export type AuditActor = z.infer<typeof AuditActor>;

export const AuditEntry = z.object({
  id: Id,
  action: AuditAction,
  actor: AuditActor,
  target_type: z.string().min(1).max(64),
  target_id: Id.nullable(),
  details: z.record(z.unknown()),
  created_at: Timestamp,
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditQuery = PageQuery.extend({
  action: AuditAction.optional(),
  target_id: Id.optional(),
});
export type AuditQuery = z.infer<typeof AuditQuery>;
