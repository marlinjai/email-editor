import { describe, it, expect } from 'vitest';
import {
  calculateEngagementScore,
  buildContactEngagement,
  categorizeEngagement,
} from '../engagement';
import type { TrackingEvent } from '../types';

function makeEvent(overrides?: Partial<TrackingEvent>): TrackingEvent {
  return {
    id: 'evt1',
    campaignId: 'camp1',
    contactId: 'c1',
    type: 'open',
    timestamp: new Date().toISOString(), // recent by default
    ...overrides,
  };
}

describe('calculateEngagementScore', () => {
  it('should return 0 for no events', () => {
    expect(calculateEngagementScore([])).toBe(0);
  });

  it('should score recent opens positively', () => {
    const events = [
      makeEvent({ type: 'open' }),
      makeEvent({ id: 'evt2', type: 'open' }),
    ];
    const score = calculateEngagementScore(events);
    expect(score).toBeGreaterThan(0);
  });

  it('should score clicks higher than opens', () => {
    const openScore = calculateEngagementScore([makeEvent({ type: 'open' })]);
    const clickScore = calculateEngagementScore([makeEvent({ type: 'click' })]);
    expect(clickScore).toBeGreaterThan(openScore);
  });

  it('should reduce score for bounces', () => {
    const events = [
      makeEvent({ type: 'open' }),
      makeEvent({ id: 'evt2', type: 'bounce' }),
    ];
    const score = calculateEngagementScore(events);
    const openOnlyScore = calculateEngagementScore([makeEvent({ type: 'open' })]);
    expect(score).toBeLessThan(openOnlyScore);
  });

  it('should apply recency decay', () => {
    const recentEvent = makeEvent({ type: 'click', timestamp: new Date().toISOString() });
    const oldEvent = makeEvent({
      type: 'click',
      timestamp: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const recentScore = calculateEngagementScore([recentEvent]);
    const oldScore = calculateEngagementScore([oldEvent]);
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('should clamp score between 0 and 100', () => {
    // Many negative events
    const negativeEvents = Array.from({ length: 20 }, (_, i) =>
      makeEvent({ id: `e${i}`, type: 'bounce' }),
    );
    expect(calculateEngagementScore(negativeEvents)).toBe(0);

    // Many positive events
    const positiveEvents = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ id: `e${i}`, type: 'click' }),
    );
    expect(calculateEngagementScore(positiveEvents)).toBeLessThanOrEqual(100);
  });
});

describe('buildContactEngagement', () => {
  it('should build engagement from events', () => {
    const events: TrackingEvent[] = [
      makeEvent({ type: 'open', timestamp: '2024-06-01T10:00:00Z' }),
      makeEvent({ id: 'evt2', type: 'open', timestamp: '2024-06-02T10:00:00Z' }),
      makeEvent({ id: 'evt3', type: 'click', url: 'https://a.com', timestamp: '2024-06-02T11:00:00Z' }),
    ];

    const engagement = buildContactEngagement('c1', events);
    expect(engagement.contactId).toBe('c1');
    expect(engagement.totalOpens).toBe(2);
    expect(engagement.totalClicks).toBe(1);
    expect(engagement.lastOpenAt).toBe('2024-06-02T10:00:00Z');
    expect(engagement.lastClickAt).toBe('2024-06-02T11:00:00Z');
    expect(engagement.engagementScore).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty events', () => {
    const engagement = buildContactEngagement('c1', []);
    expect(engagement.totalOpens).toBe(0);
    expect(engagement.totalClicks).toBe(0);
    expect(engagement.lastOpenAt).toBeUndefined();
    expect(engagement.lastClickAt).toBeUndefined();
    expect(engagement.engagementScore).toBe(0);
  });
});

describe('categorizeEngagement', () => {
  it('should categorize highly engaged', () => {
    expect(categorizeEngagement(80)).toBe('highly_engaged');
    expect(categorizeEngagement(70)).toBe('highly_engaged');
  });

  it('should categorize engaged', () => {
    expect(categorizeEngagement(50)).toBe('engaged');
    expect(categorizeEngagement(40)).toBe('engaged');
  });

  it('should categorize low engagement', () => {
    expect(categorizeEngagement(20)).toBe('low_engagement');
    expect(categorizeEngagement(10)).toBe('low_engagement');
  });

  it('should categorize inactive', () => {
    expect(categorizeEngagement(5)).toBe('inactive');
    expect(categorizeEngagement(0)).toBe('inactive');
  });
});
