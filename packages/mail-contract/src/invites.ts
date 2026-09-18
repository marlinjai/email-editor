import { z } from 'zod';
import { Email, Id, PageQuery, Timestamp } from './common';
import { MemberRole, WorkspaceMembership } from './workspace';

/*
 * S3: invitations. How a person who is not a member yet joins a workspace.
 *
 * The service binds members by auth-brain subject and never talks to
 * auth-brain, so an admin cannot add someone by email alone. An invitation is
 * the bridge: an admin invites an address with a role, the service answers
 * with a token shown once (the dashboard turns it into a link), and the
 * invited person, signed in through the dashboard with that address, accepts
 * it. Stored as a hash, single use, revocable, and it expires.
 */

export const INVITE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export const InviteStatus = z.enum(INVITE_STATUSES);
export type InviteStatus = z.infer<typeof InviteStatus>;

/** How long an invitation is valid when the request does not say. */
export const DEFAULT_INVITE_TTL_DAYS = 7;
export const MAX_INVITE_TTL_DAYS = 30;

export const Invite = z.object({
  id: Id,
  /** Stored lowercased; only a person signed in with this address can accept. */
  email: Email,
  role: MemberRole,
  /** Derived from the timestamps below, never stored. */
  status: InviteStatus,
  /** The member who invited, while they are still one (null after they left). */
  invited_by: z.object({ member_id: Id.nullable(), email: Email.nullable() }),
  expires_at: Timestamp,
  accepted_at: Timestamp.nullable(),
  revoked_at: Timestamp.nullable(),
  created_at: Timestamp,
});
export type Invite = z.infer<typeof Invite>;

/**
 * Inviting an address. The same address with an invitation still pending is
 * `already_exists` (revoke it first); a current member is `already_exists`
 * too. Only an owner can invite another owner. Inviting needs a person signed
 * in through the dashboard (an API key is `forbidden`), because accepting
 * re-checks that the inviter may still grant the role.
 */
export const InviteCreate = z.object({
  email: Email,
  role: MemberRole,
  expires_in_days: z.number().int().min(1).max(MAX_INVITE_TTL_DAYS).optional(),
});
export type InviteCreate = z.infer<typeof InviteCreate>;

/** The only response that carries the token. Shown once; it is stored as a hash. */
export const InviteCreated = z.object({
  invite: Invite,
  token: z.string().min(32).max(128),
});
export type InviteCreated = z.infer<typeof InviteCreated>;

export const InviteListQuery = PageQuery.extend({
  status: InviteStatus.optional(),
});
export type InviteListQuery = z.infer<typeof InviteListQuery>;

/**
 * Accepting, through the dashboard only: the signed-in person is named by
 * `x-mail-subject`, and the dashboard supplies the address auth-brain verified
 * for them. It must match the invited address (case-insensitively).
 *
 * Refusals, all with `details.reason`:
 * - `not_found`: no invitation has this token;
 * - `forbidden` with `email_mismatch` (signed in with another address) or
 *   `inviter_lacks_role` (the inviter left or can no longer grant the role);
 * - `conflict` with `expired`, `revoked` or `accepted` (single use: an
 *   invitation already used cannot add anyone again).
 * Accepting while already a member of the workspace uses the invitation up and
 * succeeds with `already_member: true`, changing nothing.
 */
export const InviteAccept = z.object({
  token: z.string().min(32).max(128),
  email: Email,
  name: z.string().max(200).nullable().optional(),
});
export type InviteAccept = z.infer<typeof InviteAccept>;

export const InviteAccepted = z.object({
  workspace: WorkspaceMembership,
  already_member: z.boolean(),
});
export type InviteAccepted = z.infer<typeof InviteAccepted>;

export const INVITE_REFUSAL_REASONS = ['email_mismatch', 'inviter_lacks_role', 'expired', 'revoked', 'accepted'] as const;
export type InviteRefusalReason = (typeof INVITE_REFUSAL_REASONS)[number];
