import type { ProviderUsage } from '@marlinjai/mail-contract';
import type { Db } from './db.js';
import { repos } from './repo/index.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type Reservation =
  | { ok: true; reservationId: string }
  /** The rolling window is full; enough of it frees up at `retryAfter`. */
  | { ok: false; reason: 'exhausted'; retryAfter: Date }
  /** More recipients than the whole daily budget: waiting will never help. */
  | { ok: false; reason: 'exceeds_budget' };

/**
 * The rolling 24-hour recipient budget of a provider (its `daily_recipient_budget`).
 *
 * Contract:
 * - `reserve` must run inside a transaction (`tx`). It locks the provider row,
 *   sums the recipients of the last 24 hours in the `provider_sends` ledger, and
 *   either records `recipients` more (returning the ledger entry as the
 *   reservation) or refuses. The lock makes concurrent reservations for one
 *   provider serialise, so two workers can never both pass the check.
 * - Every send counts, broadcast, test and transactional alike: reserve before
 *   handing any message to the provider. Commit the reservation before sending,
 *   so a crash mid-send leaves the spend counted (the safe side).
 * - `release` returns a reservation whose message was provably never handed to
 *   the provider (a transient failure before the body was sent, for example). Do
 *   not release after an unknown outcome: the provider may have counted it.
 * - `workspaceId` comes first, as for every workspace-owned query.
 */
export interface Budget {
  reserve(tx: Db, workspaceId: string, providerId: string, recipients: number): Promise<Reservation>;
  release(tx: Db, workspaceId: string, reservationId: string): Promise<void>;
  usage(db: Db, workspaceId: string, providerId: string): Promise<ProviderUsage>;
}

export class UnknownProviderError extends Error {
  constructor(providerId: string) {
    super(`provider ${providerId} does not exist in this workspace`);
    this.name = 'UnknownProviderError';
  }
}

type Entry = { recipients: number; created_at: string };

/** When the window frees `needed` recipients: the time the entry that frees the last of them leaves it. */
function freedAt(entries: Entry[], needed: number): Date | null {
  let freed = 0;
  for (const e of entries) {
    freed += e.recipients;
    if (freed >= needed) return new Date(new Date(e.created_at).getTime() + WINDOW_MS);
  }
  return null;
}

export const ledgerBudget: Budget = {
  async reserve(tx, workspaceId, providerId, recipients) {
    if (!Number.isInteger(recipients) || recipients < 1) throw new RangeError('recipients must be a positive integer');
    const r = repos(tx);
    const provider = await r.providers.lock(workspaceId, providerId);
    if (!provider) throw new UnknownProviderError(providerId);
    const limit = provider.daily_recipient_budget;
    if (recipients > limit) return { ok: false, reason: 'exceeds_budget' };
    const entries = await r.providerSends.window(workspaceId, providerId);
    const used = entries.reduce((n, e) => n + e.recipients, 0);
    const overBy = used + recipients - limit;
    if (overBy > 0) {
      // overBy <= used here, since recipients <= limit, so some entry frees it.
      return { ok: false, reason: 'exhausted', retryAfter: freedAt(entries, overBy)! };
    }
    const entry = await r.providerSends.record(workspaceId, providerId, recipients);
    return { ok: true, reservationId: entry.id };
  },

  async release(tx, workspaceId, reservationId) {
    await repos(tx).providerSends.remove(workspaceId, reservationId);
  },

  async usage(db, workspaceId, providerId) {
    const r = repos(db);
    const provider = await r.providers.getForSend(workspaceId, providerId);
    if (!provider) throw new UnknownProviderError(providerId);
    const entries = await r.providerSends.window(workspaceId, providerId);
    const used = entries.reduce((n, e) => n + e.recipients, 0);
    const remaining = Math.max(0, provider.daily_recipient_budget - used);
    return {
      provider_id: providerId,
      recipients_last_24h: used,
      remaining_budget: remaining,
      next_capacity_at: remaining > 0 ? null : freedAt(entries, used - provider.daily_recipient_budget + 1)!.toISOString(),
    };
  },
};
