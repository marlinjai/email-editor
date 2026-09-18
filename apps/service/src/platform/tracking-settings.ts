import type { Db } from '../db.js';

/**
 * What the workspace tracks right now. `settings.tracking_enabled` is the
 * master switch (turned off through workspace.update, nothing is tracked);
 * below it `workspace_tracking` holds opens and clicks separately, and an
 * absent row means both off. Off by default on every count.
 */
export async function effectiveTracking(db: Db, workspaceId: string): Promise<{ opens: boolean; clicks: boolean }> {
  const rows = await db<{ master: boolean | null; opens: boolean | null; clicks: boolean | null }[]>`
    SELECT (w.settings ->> 'tracking_enabled')::boolean AS master, t.opens, t.clicks
    FROM workspaces w LEFT JOIN workspace_tracking t ON t.workspace_id = w.id
    WHERE w.id = ${workspaceId}`;
  const row = rows[0];
  const master = row?.master === true;
  return { opens: master && row?.opens === true, clicks: master && row?.clicks === true };
}
