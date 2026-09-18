import { z } from 'zod';

/**
 * Request and response shapes of the S0 routes.
 *
 * A deliberate mirror of `@marlinjai/mail-contract` (common.ts, workspace.ts),
 * written while the contract package is built in parallel. Field names and
 * limits match it one for one; when the contract merges, this file becomes a
 * re-export of it and nothing else in the service changes.
 */

export const Id = z.string().min(1).max(64);
export const Uuid = z.string().uuid();
export const Email = z.string().trim().min(3).max(254).email();
export const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens');

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

export const PageQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
});

export const WorkspaceSettings = z.object({
  default_locale: z.string().min(2).max(35),
  locales: z.array(z.string().min(2).max(35)).min(1).max(20),
  tracking_enabled: z.boolean(),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettings>;

/** The default language has to be one the pages are actually offered in. */
export function settingsProblem(settings: WorkspaceSettings): string | null {
  return settings.locales.includes(settings.default_locale)
    ? null
    : `default_locale "${settings.default_locale}" must be one of locales`;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  default_locale: 'en',
  locales: ['en'],
  tracking_enabled: false,
};

export const WorkspaceCreate = z.object({
  slug: Slug,
  name: z.string().trim().min(1).max(120),
  settings: WorkspaceSettings.partial().optional(),
  /** The acting subject becomes the first owner; the dashboard supplies who they are. */
  owner: z.object({
    email: Email,
    name: z.string().trim().max(200).nullable().optional(),
  }),
});

export const WorkspaceUpdate = z
  .object({
    name: z.string().trim().min(1).max(120),
    settings: WorkspaceSettings.partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');

export const MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export const MemberRole = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof MemberRole>;

export const MemberCreate = z.object({
  subject: z.string().trim().min(1).max(255),
  email: Email,
  name: z.string().trim().max(200).nullable().optional(),
  role: MemberRole,
});

export const MemberUpdate = z.object({ role: MemberRole });

export const API_KEY_SCOPES = ['full', 'read', 'send'] as const;
export const ApiKeyScope = z.enum(API_KEY_SCOPES);
export type ApiKeyScope = z.infer<typeof ApiKeyScope>;

export const ApiKeyCreate = z.object({
  name: z.string().trim().min(1).max(120),
  scope: ApiKeyScope.optional(),
});

export const AUDIT_ACTIONS = [
  'workspace.created',
  'workspace.updated',
  'member.added',
  'member.role_changed',
  'member.removed',
  'api_key.created',
  'api_key.revoked',
] as const;
export const AuditAction = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditQuery = PageQuery.extend({
  action: AuditAction.optional(),
  target_id: Id.optional(),
});

export type AuditActor =
  | { type: 'member'; member_id: string; subject: string }
  | { type: 'api_key'; api_key_id: string }
  | { type: 'system'; reason: string };

export const IdParams = z.object({ id: Uuid });
