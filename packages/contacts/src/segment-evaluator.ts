import type { Contact, SegmentRule, SegmentOperator, SegmentGroup } from './types';

/**
 * Evaluate a single rule against a contact.
 */
export function evaluateRule(contact: Contact, rule: SegmentRule): boolean {
  const fieldValue = getFieldValue(contact, rule.field);
  return applyOperator(fieldValue, rule.operator, rule.value);
}

/**
 * Evaluate a set of rules with AND logic (all must match).
 */
export function evaluateRules(contact: Contact, rules: SegmentRule[]): boolean {
  if (rules.length === 0) return true;
  return rules.every((rule) => evaluateRule(contact, rule));
}

/**
 * Evaluate a segment group with AND/OR logic.
 */
export function evaluateSegmentGroup(contact: Contact, group: SegmentGroup): boolean {
  if (group.rules.length === 0) return true;
  if (group.logic === 'and') {
    return group.rules.every((rule) => evaluateRule(contact, rule));
  }
  return group.rules.some((rule) => evaluateRule(contact, rule));
}

/**
 * Get a field value from a contact by field name.
 */
function getFieldValue(contact: Contact, field: string): string {
  switch (field) {
    case 'email':
      return contact.email;
    case 'firstName':
    case 'first_name':
      return contact.firstName ?? '';
    case 'lastName':
    case 'last_name':
      return contact.lastName ?? '';
    case 'status':
      return contact.status;
    case 'tags':
      return contact.tags.join(',');
    default:
      // Check custom fields
      return contact.customFields[field] ?? '';
  }
}

/**
 * Apply a segment operator to compare fieldValue against ruleValue.
 */
function applyOperator(fieldValue: string, operator: SegmentOperator, ruleValue: string): boolean {
  const lower = fieldValue.toLowerCase();
  const lowerRule = ruleValue.toLowerCase();

  switch (operator) {
    case 'equals':
      return lower === lowerRule;
    case 'not_equals':
      return lower !== lowerRule;
    case 'contains':
      return lower.includes(lowerRule);
    case 'not_contains':
      return !lower.includes(lowerRule);
    case 'starts_with':
      return lower.startsWith(lowerRule);
    case 'ends_with':
      return lower.endsWith(lowerRule);
    case 'is_empty':
      return fieldValue === '';
    case 'is_not_empty':
      return fieldValue !== '';
    case 'greater_than':
      return fieldValue > ruleValue;
    case 'less_than':
      return fieldValue < ruleValue;
    default:
      return false;
  }
}
