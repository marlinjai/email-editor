import { describe, it, expect } from 'vitest';
import { evaluateRule, evaluateRules, evaluateSegmentGroup } from '../segment-evaluator';
import type { Contact, SegmentRule, SegmentGroup } from '../types';

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: 'c1',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    status: 'active',
    tags: ['vip', 'newsletter'],
    customFields: { company: 'Acme' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('evaluateRule', () => {
  it('equals operator', () => {
    const rule: SegmentRule = { field: 'email', operator: 'equals', value: 'john@example.com' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
    expect(evaluateRule(makeContact({ email: 'other@test.com' }), rule)).toBe(false);
  });

  it('equals is case-insensitive', () => {
    const rule: SegmentRule = { field: 'email', operator: 'equals', value: 'JOHN@EXAMPLE.COM' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });

  it('not_equals operator', () => {
    const rule: SegmentRule = { field: 'status', operator: 'not_equals', value: 'bounced' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });

  it('contains operator', () => {
    const rule: SegmentRule = { field: 'email', operator: 'contains', value: 'example' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
    expect(evaluateRule(makeContact({ email: 'user@other.com' }), rule)).toBe(false);
  });

  it('not_contains operator', () => {
    const rule: SegmentRule = { field: 'email', operator: 'not_contains', value: 'spam' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });

  it('starts_with operator', () => {
    const rule: SegmentRule = { field: 'email', operator: 'starts_with', value: 'john' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
    expect(evaluateRule(makeContact({ email: 'jane@test.com' }), rule)).toBe(false);
  });

  it('ends_with operator', () => {
    const rule: SegmentRule = { field: 'email', operator: 'ends_with', value: 'example.com' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });

  it('is_empty operator', () => {
    const rule: SegmentRule = { field: 'firstName', operator: 'is_empty', value: '' };
    expect(evaluateRule(makeContact({ firstName: undefined }), rule)).toBe(true);
    expect(evaluateRule(makeContact({ firstName: 'John' }), rule)).toBe(false);
  });

  it('is_not_empty operator', () => {
    const rule: SegmentRule = { field: 'firstName', operator: 'is_not_empty', value: '' };
    expect(evaluateRule(makeContact({ firstName: 'John' }), rule)).toBe(true);
    expect(evaluateRule(makeContact({ firstName: undefined }), rule)).toBe(false);
  });

  it('handles custom fields', () => {
    const rule: SegmentRule = { field: 'company', operator: 'equals', value: 'Acme' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });

  it('handles tags field as comma-joined string', () => {
    const rule: SegmentRule = { field: 'tags', operator: 'contains', value: 'vip' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });

  it('handles missing custom field', () => {
    const rule: SegmentRule = { field: 'nonexistent', operator: 'is_empty', value: '' };
    expect(evaluateRule(makeContact(), rule)).toBe(true);
  });
});

describe('evaluateRules', () => {
  it('should return true for empty rules', () => {
    expect(evaluateRules(makeContact(), [])).toBe(true);
  });

  it('should AND all rules (all must match)', () => {
    const rules: SegmentRule[] = [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'email', operator: 'contains', value: 'example' },
    ];
    expect(evaluateRules(makeContact(), rules)).toBe(true);
  });

  it('should fail if any rule fails', () => {
    const rules: SegmentRule[] = [
      { field: 'status', operator: 'equals', value: 'active' },
      { field: 'email', operator: 'contains', value: 'nonexistent' },
    ];
    expect(evaluateRules(makeContact(), rules)).toBe(false);
  });
});

describe('evaluateSegmentGroup', () => {
  it('should AND group: all rules must match', () => {
    const group: SegmentGroup = {
      logic: 'and',
      rules: [
        { field: 'status', operator: 'equals', value: 'active' },
        { field: 'email', operator: 'contains', value: 'example' },
      ],
    };
    expect(evaluateSegmentGroup(makeContact(), group)).toBe(true);
  });

  it('should AND group: fail if one fails', () => {
    const group: SegmentGroup = {
      logic: 'and',
      rules: [
        { field: 'status', operator: 'equals', value: 'active' },
        { field: 'status', operator: 'equals', value: 'bounced' },
      ],
    };
    expect(evaluateSegmentGroup(makeContact(), group)).toBe(false);
  });

  it('should OR group: any rule can match', () => {
    const group: SegmentGroup = {
      logic: 'or',
      rules: [
        { field: 'status', operator: 'equals', value: 'bounced' },
        { field: 'email', operator: 'contains', value: 'example' },
      ],
    };
    expect(evaluateSegmentGroup(makeContact(), group)).toBe(true);
  });

  it('should OR group: fail if none match', () => {
    const group: SegmentGroup = {
      logic: 'or',
      rules: [
        { field: 'status', operator: 'equals', value: 'bounced' },
        { field: 'email', operator: 'contains', value: 'nonexistent' },
      ],
    };
    expect(evaluateSegmentGroup(makeContact(), group)).toBe(false);
  });

  it('should handle empty rules', () => {
    expect(evaluateSegmentGroup(makeContact(), { logic: 'and', rules: [] })).toBe(true);
    expect(evaluateSegmentGroup(makeContact(), { logic: 'or', rules: [] })).toBe(true);
  });
});
