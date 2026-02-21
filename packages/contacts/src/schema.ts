/**
 * Data Brain table schema definitions for the contacts package.
 * These describe the tables that need to exist in Data Brain
 * to store contacts, segments, and unsubscribe records.
 */
export const CONTACT_TABLES = {
  contacts: {
    name: 'contacts',
    columns: [
      { name: 'email', type: 'text' as const, required: true },
      { name: 'first_name', type: 'text' as const },
      { name: 'last_name', type: 'text' as const },
      { name: 'status', type: 'select' as const, options: ['active', 'unsubscribed', 'bounced', 'complained'] },
      { name: 'tags', type: 'multi_select' as const, options: [] as string[] },
      { name: 'custom_fields', type: 'text' as const }, // JSON string
    ],
  },
  segments: {
    name: 'segments',
    columns: [
      { name: 'name', type: 'text' as const, required: true },
      { name: 'description', type: 'text' as const },
      { name: 'rules_json', type: 'text' as const, required: true },
      { name: 'contact_count', type: 'number' as const },
    ],
  },
  unsubscribes: {
    name: 'unsubscribes',
    columns: [
      { name: 'contact_id', type: 'text' as const, required: true },
      { name: 'reason', type: 'text' as const },
      { name: 'method', type: 'select' as const, options: ['link', 'manual', 'admin', 'api'] },
    ],
  },
} as const;
