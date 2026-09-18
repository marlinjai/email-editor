import type { TrackingSettings } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';
import { repos } from '../repo/index.js';

/**
 * What a workspace tracks right now: its tracking setting (`tracking.update`),
 * and only while the master switch `settings.tracking_enabled` is on. Off by
 * default: a workspace that never turned tracking on has both false.
 */
export async function effectiveTracking(db: Db, workspaceId: string): Promise<TrackingSettings> {
  return repos(db).workspaceTracking.effective(workspaceId);
}
