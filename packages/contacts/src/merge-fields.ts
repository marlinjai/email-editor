import type { Contact } from './types';

const MERGE_FIELD_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Resolve {{field_name}} placeholders in content using contact data.
 *
 * Supported fields:
 * - {{email}} - contact email
 * - {{first_name}} - contact first name
 * - {{last_name}} - contact last name
 * - {{full_name}} - "firstName lastName"
 * - {{status}} - contact status
 * - {{unsubscribe_url}} - replaced with the provided URL or empty string
 * - Any custom field key
 */
export function resolveMergeFields(
  content: string,
  contact: Contact,
  extras?: Record<string, string>,
): string {
  return content.replace(MERGE_FIELD_REGEX, (_match, field: string) => {
    // Check built-in fields
    switch (field) {
      case 'email':
        return contact.email;
      case 'first_name':
        return contact.firstName ?? '';
      case 'last_name':
        return contact.lastName ?? '';
      case 'full_name': {
        const parts = [contact.firstName, contact.lastName].filter(Boolean);
        return parts.join(' ');
      }
      case 'status':
        return contact.status;
      default:
        break;
    }

    // Check extras (e.g. unsubscribe_url)
    if (extras && field in extras) {
      return extras[field]!;
    }

    // Check custom fields
    if (field in contact.customFields) {
      return contact.customFields[field]!;
    }

    // Return original placeholder if unresolved
    return `{{${field}}}`;
  });
}

/**
 * Extract all {{field}} tokens from content.
 */
export function extractMergeFields(content: string): string[] {
  const fields: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MERGE_FIELD_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const field = match[1]!;
    if (!fields.includes(field)) {
      fields.push(field);
    }
  }
  return fields;
}

/**
 * List of built-in merge fields that are always available.
 */
export const BUILT_IN_MERGE_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'full_name',
  'status',
  'unsubscribe_url',
] as const;
