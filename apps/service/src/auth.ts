import type { MiddlewareHandler } from 'hono';
import { hashApiKey, looksLikeApiKey, timingSafeEqual, verifyApiKey } from './api-key.js';
import type { AppEnv } from './context.js';
import { ApiError } from './errors.js';
import type { ApiKeyCredential } from './repo/api-keys.js';
import type { Member } from './repo/members.js';
import type { ApiKeyScope, MemberRole } from './schemas.js';

/** Header names, identical to `@marlinjai/mail-contract` headers.ts. */
export const SUBJECT_HEADER = 'x-mail-subject';
export const WORKSPACE_HEADER = 'x-mail-workspace';

export type AuthDeps = {
  dashboardServiceToken: string;
  findCredentialByHash(hash: string): Promise<ApiKeyCredential | null>;
  touchApiKey(workspaceId: string, keyId: string): Promise<void>;
  findMember(workspaceId: string, subject: string): Promise<Member | null>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1]! : null;
}

/**
 * Establishes who is calling. Two kinds of caller exist:
 *
 * - a client, with a workspace API key (`Authorization: Bearer sk_live_...`),
 *   which is bound to exactly one workspace;
 * - the dashboard, with the dashboard service token plus the auth-brain subject
 *   of the person it is acting for (`x-mail-subject`). The browser never holds
 *   either credential; the dashboard calls the service server-side.
 */
export function authenticate(deps: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearer(c.req.header('authorization'));
    if (!token) throw new ApiError('unauthenticated', 'Send a workspace API key as "Authorization: Bearer <key>".');

    if (token.startsWith('sk_')) {
      if (!looksLikeApiKey(token)) throw new ApiError('invalid_api_key', 'The API key is malformed.');
      const hash = await hashApiKey(token);
      const credential = await deps.findCredentialByHash(hash);
      // The row was found by its hash; the constant-time comparison is belt and
      // braces against a lookup that ever becomes anything but an exact match.
      if (!credential || !(await verifyApiKey(token, credential.key_hash))) {
        throw new ApiError('invalid_api_key', 'The API key is not valid.');
      }
      if (credential.revoked_at) throw new ApiError('api_key_revoked', 'The API key has been revoked.');
      await deps.touchApiKey(credential.workspace_id, credential.id);
      c.set('caller', {
        kind: 'api_key',
        workspaceId: credential.workspace_id,
        apiKeyId: credential.id,
        scope: credential.scope,
      });
      return next();
    }

    if (!timingSafeEqual(token.toLowerCase(), deps.dashboardServiceToken)) {
      throw new ApiError('unauthenticated', 'The credential is not valid.');
    }
    const subject = c.req.header(SUBJECT_HEADER)?.trim();
    if (!subject || subject.length > 255) {
      throw new ApiError('invalid_request', `A dashboard call must name the person it acts for in "${SUBJECT_HEADER}".`);
    }
    c.set('caller', { kind: 'dashboard', subject });
    return next();
  };
}

/**
 * Resolves the workspace of the request and the caller's standing in it. For a
 * key, the key's own workspace (a key can never name another). For the dashboard,
 * the workspace in `x-mail-workspace`, and only if the subject is a member of it;
 * membership and role are read fresh on every call, so a removal takes effect on
 * the next request.
 */
export function requireWorkspace(deps: Pick<AuthDeps, 'findMember'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const caller = c.get('caller');
    if (caller.kind === 'api_key') {
      c.set('access', {
        workspaceId: caller.workspaceId,
        via: 'api_key',
        apiKeyId: caller.apiKeyId,
        scope: caller.scope,
      });
      return next();
    }
    const workspaceId = c.req.header(WORKSPACE_HEADER)?.trim();
    if (!workspaceId || !UUID.test(workspaceId)) {
      throw new ApiError('invalid_request', `A dashboard call must name its workspace id in "${WORKSPACE_HEADER}".`);
    }
    const member = await deps.findMember(workspaceId.toLowerCase(), caller.subject);
    if (!member) throw new ApiError('forbidden', 'You are not a member of this workspace.');
    c.set('access', { workspaceId: workspaceId.toLowerCase(), via: 'member', member, role: member.role });
    return next();
  };
}

/** Routes only a person may call through the dashboard (workspaces, members). */
export const dashboardOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('caller').kind !== 'dashboard') {
    throw new ApiError('forbidden', 'This route is only available to signed-in people through the dashboard.');
  }
  return next();
};

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * What a caller may do, in two vocabularies that map onto each other: a member
 * needs at least `role`, a key needs one of `scopes`. `read` actions accept a
 * read key; managing the workspace needs a full key.
 */
export function permit(rule: { role: MemberRole; scopes: readonly ApiKeyScope[] }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const access = c.get('access');
    if (access.via === 'member') {
      if (!roleAtLeast(access.role, rule.role)) {
        throw new ApiError('insufficient_role', `This needs the ${rule.role} role or higher; you are ${access.role}.`, {
          required: rule.role,
          actual: access.role,
        });
      }
    } else if (!rule.scopes.includes(access.scope)) {
      throw new ApiError('forbidden', `This API key's scope (${access.scope}) does not allow this.`, {
        required: rule.scopes,
        actual: access.scope,
      });
    }
    return next();
  };
}

/** Reading the workspace itself: every member, every key. */
export const READ_WORKSPACE = { role: 'viewer', scopes: ['full', 'read', 'send'] } as const;
/** Reading administrative records (keys, audit log): admins, full and read keys. */
export const READ_ADMIN = { role: 'admin', scopes: ['full', 'read'] } as const;
/** Changing the workspace, its keys or its people: admins, full keys. */
export const MANAGE = { role: 'admin', scopes: ['full'] } as const;
