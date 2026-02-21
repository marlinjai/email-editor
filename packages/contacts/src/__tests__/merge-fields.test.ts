import { describe, it, expect } from 'vitest';
import { resolveMergeFields, extractMergeFields } from '../merge-fields';
import type { Contact } from '../types';

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: 'c1',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    status: 'active',
    tags: ['vip'],
    customFields: { company: 'Acme', role: 'CEO' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveMergeFields', () => {
  it('should resolve email field', () => {
    const contact = makeContact();
    expect(resolveMergeFields('Hello {{email}}', contact)).toBe('Hello john@example.com');
  });

  it('should resolve first_name and last_name', () => {
    const contact = makeContact();
    expect(resolveMergeFields('Hello {{first_name}} {{last_name}}', contact)).toBe(
      'Hello John Doe',
    );
  });

  it('should resolve full_name', () => {
    const contact = makeContact();
    expect(resolveMergeFields('Dear {{full_name}}', contact)).toBe('Dear John Doe');
  });

  it('should handle missing firstName for full_name', () => {
    const contact = makeContact({ firstName: undefined });
    expect(resolveMergeFields('Dear {{full_name}}', contact)).toBe('Dear Doe');
  });

  it('should resolve status', () => {
    const contact = makeContact();
    expect(resolveMergeFields('Status: {{status}}', contact)).toBe('Status: active');
  });

  it('should resolve custom fields', () => {
    const contact = makeContact();
    expect(resolveMergeFields('At {{company}} as {{role}}', contact)).toBe('At Acme as CEO');
  });

  it('should resolve extras like unsubscribe_url', () => {
    const contact = makeContact();
    const result = resolveMergeFields(
      'Click {{unsubscribe_url}} to unsubscribe',
      contact,
      { unsubscribe_url: 'https://example.com/unsub?token=abc' },
    );
    expect(result).toBe('Click https://example.com/unsub?token=abc to unsubscribe');
  });

  it('should leave unknown fields as placeholders', () => {
    const contact = makeContact();
    expect(resolveMergeFields('Hello {{unknown_field}}', contact)).toBe('Hello {{unknown_field}}');
  });

  it('should handle empty first_name', () => {
    const contact = makeContact({ firstName: undefined });
    expect(resolveMergeFields('Hi {{first_name}}', contact)).toBe('Hi ');
  });

  it('should handle content with no merge fields', () => {
    const contact = makeContact();
    expect(resolveMergeFields('No fields here', contact)).toBe('No fields here');
  });

  it('should handle multiple occurrences of the same field', () => {
    const contact = makeContact();
    expect(resolveMergeFields('{{email}} and {{email}}', contact)).toBe(
      'john@example.com and john@example.com',
    );
  });
});

describe('extractMergeFields', () => {
  it('should extract all unique fields', () => {
    expect(extractMergeFields('Hello {{first_name}} {{last_name}}, email: {{email}}')).toEqual([
      'first_name',
      'last_name',
      'email',
    ]);
  });

  it('should deduplicate fields', () => {
    expect(extractMergeFields('{{email}} and {{email}}')).toEqual(['email']);
  });

  it('should return empty array for no fields', () => {
    expect(extractMergeFields('No fields here')).toEqual([]);
  });

  it('should extract custom field names', () => {
    expect(extractMergeFields('{{company}} - {{role}}')).toEqual(['company', 'role']);
  });
});
