import { describe, it, expect } from 'vitest';
import {
  splitAudience,
  determineWinner,
  calculateResults,
  isTestComplete,
} from '../ab-testing';
import type { ABTestConfig, ABVariant } from '../types';
import type { Contact } from '@marlinjai/email-contacts';

function makeContact(id: string): Contact {
  return {
    id,
    email: `${id}@example.com`,
    firstName: id,
    status: 'active',
    tags: [],
    customFields: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

const contacts = Array.from({ length: 100 }, (_, i) => makeContact(`c${i}`));

const testConfig: ABTestConfig = {
  enabled: true,
  variants: [
    { id: 'v1', name: 'Variant A', percentage: 50 },
    { id: 'v2', name: 'Variant B', percentage: 50 },
  ],
  winnerCriteria: 'open_rate',
  testPercentage: 20,
  testDurationHours: 4,
};

describe('splitAudience', () => {
  it('should split audience into test and remaining groups', () => {
    const result = splitAudience(contacts, testConfig);
    const testTotal = result.testGroups.reduce((sum, g) => sum + g.contacts.length, 0);
    expect(testTotal).toBe(20); // 20% of 100
    expect(result.remainingContacts.length).toBe(80);
  });

  it('should split test contacts among variants', () => {
    const result = splitAudience(contacts, testConfig);
    expect(result.testGroups).toHaveLength(2);
    // Each variant gets 50% of the 20 test contacts = ~10 each
    const totalVariantContacts = result.testGroups[0]!.contacts.length + result.testGroups[1]!.contacts.length;
    expect(totalVariantContacts).toBe(20);
  });

  it('should return all contacts as remaining when disabled', () => {
    const result = splitAudience(contacts, { ...testConfig, enabled: false });
    expect(result.testGroups).toHaveLength(0);
    expect(result.remainingContacts.length).toBe(100);
  });

  it('should return all contacts as remaining when no variants', () => {
    const result = splitAudience(contacts, { ...testConfig, variants: [] });
    expect(result.testGroups).toHaveLength(0);
    expect(result.remainingContacts.length).toBe(100);
  });

  it('should handle uneven percentage splits', () => {
    const unevenConfig: ABTestConfig = {
      ...testConfig,
      variants: [
        { id: 'v1', name: 'Variant A', percentage: 70 },
        { id: 'v2', name: 'Variant B', percentage: 30 },
      ],
    };
    const result = splitAudience(contacts, unevenConfig);
    const testTotal = result.testGroups.reduce((sum, g) => sum + g.contacts.length, 0);
    expect(testTotal).toBe(20);
  });
});

describe('determineWinner', () => {
  it('should determine winner by open rate', () => {
    const results = [
      { variantId: 'v1', variantName: 'A', totalSent: 10, opens: 5, clicks: 2, openRate: 0.5, clickRate: 0.2 },
      { variantId: 'v2', variantName: 'B', totalSent: 10, opens: 8, clicks: 1, openRate: 0.8, clickRate: 0.1 },
    ];
    const winner = determineWinner(results, 'open_rate');
    expect(winner?.variantId).toBe('v2');
  });

  it('should determine winner by click rate', () => {
    const results = [
      { variantId: 'v1', variantName: 'A', totalSent: 10, opens: 5, clicks: 4, openRate: 0.5, clickRate: 0.4 },
      { variantId: 'v2', variantName: 'B', totalSent: 10, opens: 8, clicks: 1, openRate: 0.8, clickRate: 0.1 },
    ];
    const winner = determineWinner(results, 'click_rate');
    expect(winner?.variantId).toBe('v1');
  });

  it('should return null for empty results', () => {
    expect(determineWinner([], 'open_rate')).toBeNull();
  });
});

describe('calculateResults', () => {
  const variants: ABVariant[] = [
    { id: 'v1', name: 'A', percentage: 50 },
    { id: 'v2', name: 'B', percentage: 50 },
  ];

  it('should calculate rates correctly', () => {
    const results = calculateResults(
      variants,
      { v1: 100, v2: 100 },
      { v1: 50, v2: 30 },
      { v1: 20, v2: 10 },
    );
    expect(results[0]!.openRate).toBe(0.5);
    expect(results[0]!.clickRate).toBe(0.2);
    expect(results[1]!.openRate).toBe(0.3);
    expect(results[1]!.clickRate).toBe(0.1);
  });

  it('should handle zero sent count', () => {
    const results = calculateResults(variants, {}, {}, {});
    expect(results[0]!.openRate).toBe(0);
    expect(results[0]!.clickRate).toBe(0);
  });
});

describe('isTestComplete', () => {
  it('should return true when duration has elapsed', () => {
    const fourHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    expect(isTestComplete(fourHoursAgo, 4)).toBe(true);
  });

  it('should return false when duration has not elapsed', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isTestComplete(oneHourAgo, 4)).toBe(false);
  });
});
