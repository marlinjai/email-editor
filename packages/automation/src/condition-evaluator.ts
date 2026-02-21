import type { Contact } from '@marlinjai/email-contacts';
import type { ConditionRule, ConditionBranch } from './types';

/**
 * Context available for condition evaluation.
 * `engagement` tracks campaign-level interactions.
 */
export interface EvaluationContext {
  contact: Contact;
  engagement?: {
    opened?: boolean;
    clicked?: boolean;
    openCount?: number;
    clickCount?: number;
    lastOpenedAt?: string;
    lastClickedAt?: string;
  };
  eventData?: Record<string, unknown>;
}

/**
 * Resolve a dotted field path against the evaluation context.
 * Supports:
 *   - contact.email, contact.firstName, contact.status, etc.
 *   - contact.tags (returns joined CSV)
 *   - contact.customFields.<key>
 *   - engagement.opened, engagement.clickCount, etc.
 *   - eventData.<key>
 */
function resolveField(ctx: EvaluationContext, field: string): string {
  const parts = field.split('.');
  const root = parts[0];

  if (root === 'contact') {
    const prop = parts[1];
    if (!prop) return '';
    if (prop === 'tags') return ctx.contact.tags.join(',');
    if (prop === 'customFields' && parts[2]) {
      return ctx.contact.customFields[parts[2]] ?? '';
    }
    const contactRecord: Record<string, unknown> = {
      id: ctx.contact.id,
      email: ctx.contact.email,
      firstName: ctx.contact.firstName,
      lastName: ctx.contact.lastName,
      status: ctx.contact.status,
      createdAt: ctx.contact.createdAt,
      updatedAt: ctx.contact.updatedAt,
    };
    const val = contactRecord[prop];
    return val != null ? String(val) : '';
  }

  if (root === 'engagement' && ctx.engagement) {
    const prop = parts[1];
    if (!prop) return '';
    const val = (ctx.engagement as Record<string, unknown>)[prop];
    return val != null ? String(val) : '';
  }

  if (root === 'eventData' && ctx.eventData) {
    const prop = parts[1];
    if (!prop) return '';
    const val = ctx.eventData[prop];
    return val != null ? String(val) : '';
  }

  return '';
}

/**
 * Evaluate a single condition rule against the context.
 */
export function evaluateRule(rule: ConditionRule, ctx: EvaluationContext): boolean {
  const fieldValue = resolveField(ctx, rule.field);

  switch (rule.operator) {
    case 'equals':
      return fieldValue === rule.value;
    case 'not_equals':
      return fieldValue !== rule.value;
    case 'contains':
      return fieldValue.includes(rule.value);
    case 'not_contains':
      return !fieldValue.includes(rule.value);
    case 'greater_than':
      return Number(fieldValue) > Number(rule.value);
    case 'less_than':
      return Number(fieldValue) < Number(rule.value);
    case 'is_true':
      return fieldValue === 'true';
    case 'is_false':
      return fieldValue === 'false' || fieldValue === '';
    default:
      return false;
  }
}

/**
 * Evaluate all rules in a branch (AND logic within a branch).
 */
export function evaluateBranch(branch: ConditionBranch, ctx: EvaluationContext): boolean {
  return branch.rules.every((rule) => evaluateRule(rule, ctx));
}

/**
 * Evaluate multiple branches and return the first matching branch ID,
 * or undefined if no branch matches.
 */
export function evaluateCondition(
  branches: ConditionBranch[],
  ctx: EvaluationContext
): ConditionBranch | undefined {
  return branches.find((branch) => evaluateBranch(branch, ctx));
}
