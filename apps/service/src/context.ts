import type { ApiKeyScope, AuditActor, MemberRole } from '@marlinjai/mail-contract';
import type { Member } from './repo/members.js';

/** Who is calling. Set by the auth middleware before any route runs. */
export type Caller =
  | { kind: 'api_key'; workspaceId: string; apiKeyId: string; scope: ApiKeyScope }
  /** The dashboard, acting for a signed-in auth-brain subject. */
  | { kind: 'dashboard'; subject: string };

/** The workspace a request operates on, and the caller's standing in it. */
export type WorkspaceAccess =
  | { workspaceId: string; via: 'api_key'; apiKeyId: string; scope: ApiKeyScope }
  | { workspaceId: string; via: 'member'; member: Member; role: MemberRole };

export type AppEnv = {
  Variables: {
    requestId: string;
    caller: Caller;
    access: WorkspaceAccess;
  };
};

export function actorOf(access: WorkspaceAccess): AuditActor {
  return access.via === 'api_key'
    ? { type: 'api_key', api_key_id: access.apiKeyId }
    : { type: 'member', member_id: access.member.id, subject: access.member.subject };
}
