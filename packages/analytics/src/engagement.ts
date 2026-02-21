import type { TrackingEvent, ContactEngagement } from './types';

/**
 * Weight configuration for engagement scoring.
 */
export interface EngagementWeights {
  open: number;
  click: number;
  bounce: number;
  unsubscribe: number;
  complaint: number;
  delivered: number;
  recencyDecayDays: number;
}

const DEFAULT_WEIGHTS: EngagementWeights = {
  open: 1,
  click: 3,
  bounce: -5,
  unsubscribe: -10,
  complaint: -10,
  delivered: 0,
  recencyDecayDays: 30,
};

/**
 * Calculate engagement score for a contact based on their tracking events.
 * Score uses weighted events with a recency decay factor.
 */
export function calculateEngagementScore(
  events: TrackingEvent[],
  weights: EngagementWeights = DEFAULT_WEIGHTS,
): number {
  if (events.length === 0) return 0;

  const now = Date.now();
  let score = 0;

  for (const event of events) {
    const weight = weights[event.type] ?? 0;
    if (weight === 0) continue;

    // Apply recency decay: events further in the past count less
    const eventTime = new Date(event.timestamp).getTime();
    const daysSince = (now - eventTime) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.max(0, 1 - daysSince / weights.recencyDecayDays);

    score += weight * decayFactor;
  }

  // Normalize: clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score * 10)));
}

/**
 * Build a ContactEngagement summary from raw events.
 */
export function buildContactEngagement(
  contactId: string,
  events: TrackingEvent[],
  weights?: EngagementWeights,
): ContactEngagement {
  const opens = events.filter((e) => e.type === 'open');
  const clicks = events.filter((e) => e.type === 'click');

  const lastOpen = opens.length > 0
    ? opens.reduce((latest, e) => (e.timestamp > latest.timestamp ? e : latest)).timestamp
    : undefined;

  const lastClick = clicks.length > 0
    ? clicks.reduce((latest, e) => (e.timestamp > latest.timestamp ? e : latest)).timestamp
    : undefined;

  return {
    contactId,
    totalOpens: opens.length,
    totalClicks: clicks.length,
    lastOpenAt: lastOpen,
    lastClickAt: lastClick,
    engagementScore: calculateEngagementScore(events, weights),
  };
}

/**
 * Categorize a contact's engagement level based on their score.
 */
export type EngagementLevel = 'highly_engaged' | 'engaged' | 'low_engagement' | 'inactive';

export function categorizeEngagement(score: number): EngagementLevel {
  if (score >= 70) return 'highly_engaged';
  if (score >= 40) return 'engaged';
  if (score >= 10) return 'low_engagement';
  return 'inactive';
}
