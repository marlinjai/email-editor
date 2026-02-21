'use client';

import { ContactList } from '@marlinjai/email-contacts/react';
import type { ContactStorageAdapter, Contact, ContactListOptions } from '@marlinjai/email-contacts/react';

const MOCK_CONTACTS: Contact[] = [
  {
    id: 'c1',
    email: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Johnson',
    status: 'active',
    tags: ['newsletter', 'vip'],
    customFields: {},
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-02-15T14:30:00Z',
  },
  {
    id: 'c2',
    email: 'bob@example.com',
    firstName: 'Bob',
    lastName: 'Smith',
    status: 'active',
    tags: ['newsletter'],
    customFields: {},
    createdAt: '2026-01-12T08:00:00Z',
    updatedAt: '2026-02-10T09:00:00Z',
  },
  {
    id: 'c3',
    email: 'carol@example.com',
    firstName: 'Carol',
    lastName: 'Williams',
    status: 'unsubscribed',
    tags: ['marketing'],
    customFields: {},
    createdAt: '2025-12-20T12:00:00Z',
    updatedAt: '2026-01-28T16:00:00Z',
  },
  {
    id: 'c4',
    email: 'dave@example.com',
    firstName: 'Dave',
    lastName: 'Brown',
    status: 'active',
    tags: ['newsletter', 'marketing'],
    customFields: {},
    createdAt: '2026-02-01T07:00:00Z',
    updatedAt: '2026-02-19T11:00:00Z',
  },
];

// Mock adapter that returns static data
const mockAdapter: ContactStorageAdapter = {
  listContacts: async (_options?: ContactListOptions) => ({
    data: MOCK_CONTACTS,
    total: MOCK_CONTACTS.length,
  }),
  getContact: async (id: string) => MOCK_CONTACTS.find((c) => c.id === id) ?? null,
  getContactByEmail: async () => null,
  createContact: async () => MOCK_CONTACTS[0]!,
  updateContact: async () => MOCK_CONTACTS[0]!,
  deleteContact: async () => {},
  bulkCreateContacts: async () => ({ created: 0, updated: 0 }),
  createSegment: async () => ({ id: 's1', name: 'Test', rules: [], contactCount: 0, createdAt: '' }),
  listSegments: async () => [],
  getSegmentContacts: async () => ({ data: [], total: 0 }),
  deleteSegment: async () => {},
  recordUnsubscribe: async () => {},
  isUnsubscribed: async () => false,
};

export default function ContactsPage() {
  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Contacts</h1>
        <p>Manage your audience and subscriber lists</p>
      </div>
      <div className="dashboard-section">
        <ContactList adapter={mockAdapter} />
      </div>
    </div>
  );
}
