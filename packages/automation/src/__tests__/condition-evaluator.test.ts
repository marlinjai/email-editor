import { describe, it, expect } from 'vitest';
import { evaluateRule, evaluateBranch, evaluateCondition } from '../condition-evaluator';
import type { EvaluationContext } from '../condition-evaluator';
import type { ConditionRule, ConditionBranch } from '../types';
import type { Contact } from '@marlinjai/email-contacts';

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: 'c-1',
    email: 'test@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    status: 'active',
    tags: ['vip', 'newsletter'],
    customFields: { plan: 'pro', country: 'US' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<EvaluationContext>): EvaluationContext {
  return {
    contact: makeContact(),
    ...overrides,
  };
}

describe('evaluateRule', () => {
  it('equals matches exact value', () => {
    const rule: ConditionRule = { field: 'contact.email', operator: 'equals', value: 'test@example.com' };
    expect(evaluateRule(rule, makeCtx())).toBe(true);
  });

  it('equals rejects non-match', () => {
    const rule: ConditionRule = { field: 'contact.email', operator: 'equals', value: 'other@example.com' };
    expect(evaluateRule(rule, makeCtx())).toBe(false);
  });

  it('not_equals works correctly', () => {
    const rule: ConditionRule = { field: 'contact.status', operator: 'not_equals', value: 'bounced' };
    expect(evaluateRule(rule, makeCtx())).toBe(true);
  });

  it('contains checks for substring', () => {
    const rule: ConditionRule = { field: 'contact.tags', operator: 'contains', value: 'vip' };
    expect(evaluateRule(rule, makeCtx())).toBe(true);
  });

  it('not_contains checks for missing substring', () => {
    const rule: ConditionRule = { field: 'contact.tags', operator: 'not_contains', value: 'premium' };
    expect(evaluateRule(rule, makeCtx())).toBe(true);
  });

  it('greater_than compares numbers', () => {
    const ctx = makeCtx({ engagement: { openCount: 5 } });
    const rule: ConditionRule = { field: 'engagement.openCount', operator: 'greater_than', value: '3' };
    expect(evaluateRule(rule, ctx)).toBe(true);
  });

  it('less_than compares numbers', () => {
    const ctx = makeCtx({ engagement: { clickCount: 2 } });
    const rule: ConditionRule = { field: 'engagement.clickCount', operator: 'less_than', value: '5' };
    expect(evaluateRule(rule, ctx)).toBe(true);
  });

  it('is_true checks boolean-like string', () => {
    const ctx = makeCtx({ engagement: { opened: true } });
    const rule: ConditionRule = { field: 'engagement.opened', operator: 'is_true', value: '' };
    expect(evaluateRule(rule, ctx)).toBe(true);
  });

  it('is_false checks falsy value', () => {
    const ctx = makeCtx({ engagement: { opened: false } });
    const rule: ConditionRule = { field: 'engagement.opened', operator: 'is_false', value: '' };
    expect(evaluateRule(rule, ctx)).toBe(true);
  });

  it('resolves custom fields', () => {
    const rule: ConditionRule = { field: 'contact.customFields.plan', operator: 'equals', value: 'pro' };
    expect(evaluateRule(rule, makeCtx())).toBe(true);
  });

  it('resolves event data', () => {
    const ctx = makeCtx({ eventData: { product_id: 'SKU-123' } });
    const rule: ConditionRule = { field: 'eventData.product_id', operator: 'equals', value: 'SKU-123' };
    expect(evaluateRule(rule, ctx)).toBe(true);
  });

  it('returns empty string for unknown fields', () => {
    const rule: ConditionRule = { field: 'unknown.field', operator: 'equals', value: '' };
    expect(evaluateRule(rule, makeCtx())).toBe(true);
  });
});

describe('evaluateBranch', () => {
  it('returns true when all rules match (AND)', () => {
    const branch: ConditionBranch = {
      id: 'b1',
      label: 'VIP with email opened',
      rules: [
        { field: 'contact.tags', operator: 'contains', value: 'vip' },
        { field: 'contact.status', operator: 'equals', value: 'active' },
      ],
    };
    expect(evaluateBranch(branch, makeCtx())).toBe(true);
  });

  it('returns false when any rule fails', () => {
    const branch: ConditionBranch = {
      id: 'b1',
      label: 'Test',
      rules: [
        { field: 'contact.tags', operator: 'contains', value: 'vip' },
        { field: 'contact.status', operator: 'equals', value: 'bounced' },
      ],
    };
    expect(evaluateBranch(branch, makeCtx())).toBe(false);
  });

  it('returns true for empty rules', () => {
    const branch: ConditionBranch = { id: 'b1', label: 'Always', rules: [] };
    expect(evaluateBranch(branch, makeCtx())).toBe(true);
  });
});

describe('evaluateCondition', () => {
  it('returns first matching branch', () => {
    const branches: ConditionBranch[] = [
      {
        id: 'yes',
        label: 'Opened',
        rules: [{ field: 'engagement.opened', operator: 'is_true', value: '' }],
        nextStepId: 'step-a',
      },
      {
        id: 'no',
        label: 'Not opened',
        rules: [{ field: 'engagement.opened', operator: 'is_false', value: '' }],
        nextStepId: 'step-b',
      },
    ];

    const ctx = makeCtx({ engagement: { opened: true } });
    const result = evaluateCondition(branches, ctx);
    expect(result).toBeDefined();
    expect(result!.id).toBe('yes');
    expect(result!.nextStepId).toBe('step-a');
  });

  it('returns undefined when no branch matches', () => {
    const branches: ConditionBranch[] = [
      {
        id: 'premium',
        label: 'Premium',
        rules: [{ field: 'contact.customFields.plan', operator: 'equals', value: 'enterprise' }],
      },
    ];
    const result = evaluateCondition(branches, makeCtx());
    expect(result).toBeUndefined();
  });

  it('returns first match when multiple branches match', () => {
    const branches: ConditionBranch[] = [
      { id: 'first', label: 'First', rules: [], nextStepId: 'step-1' },
      { id: 'second', label: 'Second', rules: [], nextStepId: 'step-2' },
    ];
    const result = evaluateCondition(branches, makeCtx());
    expect(result!.id).toBe('first');
  });
});
