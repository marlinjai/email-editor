import { z } from 'zod';
import { Timestamp } from './common';

/*
 * S4: A/B testing of a mailing's subject and content. Apart from ./platform
 * because `Mailing` (./mailings) embeds `AbTestState`, and ./platform imports
 * ./mailings.
 */

export const AbVariant = z.object({
  key: z.string().regex(/^[a-z]$/, 'a single lowercase letter'),
  subject: z.string().min(1).max(998).optional(),
  /** Replaces the mailing's document for this variant. */
  document: z.record(z.unknown()).optional(),
});
export type AbVariant = z.infer<typeof AbVariant>;

/**
 * - `opens` and `clicks` pick the variant with the most unique human opens or
 *   clicks (machine and Apple Mail Privacy Protection opens are not counted)
 *   `decide_after_minutes` after the start; a tie goes to the earlier key. They
 *   need tracking enabled on the workspace (`tracking_disabled` otherwise).
 * - `manual` waits for `mailings.pickAbWinner`. The only choice without tracking.
 *
 * `mailings.pickAbWinner` also works for a metric test before its time.
 */
export const AB_WINNER_METRICS = ['opens', 'clicks', 'manual'] as const;

export const AbTestConfig = z
  .object({
    variants: z.array(AbVariant).min(2).max(5),
    /** Share of recipients in the test group, split evenly across variants; the rest get the winner. */
    test_fraction: z.number().gt(0).lte(1),
    winner_metric: z.enum(AB_WINNER_METRICS),
    decide_after_minutes: z.number().int().min(15).max(10_080).optional(),
  })
  .refine((c) => new Set(c.variants.map((v) => v.key)).size === c.variants.length, 'variant keys must be unique')
  .refine((c) => c.variants.every((v) => v.subject !== undefined || v.document !== undefined), {
    message: 'every variant changes the subject, the document or both',
    path: ['variants'],
  })
  .refine((c) => (c.winner_metric === 'manual') === (c.decide_after_minutes === undefined), {
    message: 'opens and clicks need decide_after_minutes; manual takes none',
    path: ['decide_after_minutes'],
  });
export type AbTestConfig = z.infer<typeof AbTestConfig>;

/**
 * - `pending`: configured, the mailing has not started.
 * - `testing`: the test group is being sent; the rest is held.
 * - `awaiting_pick`: a metric test reached its time without tracking data it can
 *   use (tracking was turned off meanwhile); a person picks.
 * - `decided`: `winner` goes to the rest.
 */
export const AB_TEST_STATUSES = ['pending', 'testing', 'awaiting_pick', 'decided'] as const;

export const AbTestState = z.object({
  variants: z.array(z.object({ key: z.string(), subject: z.string().nullable(), has_document: z.boolean() })),
  test_fraction: z.number(),
  winner_metric: z.enum(AB_WINNER_METRICS),
  decide_after_minutes: z.number().int().nullable(),
  status: z.enum(AB_TEST_STATUSES),
  /** When the metric decides; null for manual or before the start. */
  decide_at: Timestamp.nullable(),
  winner: z.string().nullable(),
  decided_by: z.enum(['metric', 'manual']).nullable(),
  decided_at: Timestamp.nullable(),
});
export type AbTestState = z.infer<typeof AbTestState>;

export const AbWinnerRequest = z.object({ variant: z.string().regex(/^[a-z]$/) });
export type AbWinnerRequest = z.infer<typeof AbWinnerRequest>;

