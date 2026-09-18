import 'server-only';
import { cache } from 'react';
import type { MemberRole, WorkspaceMembership } from '@marlinjai/mail-sdk';
import { act } from './action';
import { mail } from './mail';
import type { ActionResult } from './result';

/** A preference only (which workspace / opens), never trusted: always checked against the person's memberships. */
export const LAST_WORKSPACE_COOKIE = 'mail_last_ws';

/** Every mail workspace the signed-in person belongs to, all pages of it. */
export const listMyWorkspaces = cache(async (): Promise<ActionResult<WorkspaceMembership[]>> =>
  act('workspaces.list', async () => {
    const { api } = await mail();
    const all: WorkspaceMembership[] = [];
    for await (const w of api.paginate('workspaces.list', { query: { limit: 100 } })) all.push(w);
    return all;
  }),
);

export type WorkspaceContext = {
  workspace: WorkspaceMembership;
  role: MemberRole;
  memberships: WorkspaceMembership[];
};

/**
 * The workspace a /w/<id> page is about, and the person's role in it, or why
 * not: the id is checked against the person's own memberships, so a stale or
 * guessed id is a clean "not a member", never another tenant's data.
 */
export const workspaceContext = cache(async (workspaceId: string): Promise<ActionResult<WorkspaceContext | null>> => {
  const list = await listMyWorkspaces();
  if (!list.ok) return list;
  const workspace = list.data.find((w) => w.id === workspaceId);
  if (!workspace) return { ok: true, data: null };
  return { ok: true, data: { workspace, role: workspace.role, memberships: list.data } };
});

export { can } from './roles';
