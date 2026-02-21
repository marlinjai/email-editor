import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Contact, ContactStorageAdapter, CreateContactInput, SegmentRule } from '../types';

function makeContact(overrides?: Partial<Contact>): Contact {
  return {
    id: 'c1',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    status: 'active',
    tags: ['vip'],
    customFields: {},
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockAdapter(): ContactStorageAdapter {
  const contacts: Contact[] = [
    makeContact({ id: 'c1', email: 'john@example.com', firstName: 'John', status: 'active', tags: ['vip'] }),
    makeContact({ id: 'c2', email: 'jane@example.com', firstName: 'Jane', status: 'active', tags: ['newsletter'] }),
    makeContact({ id: 'c3', email: 'bob@test.com', firstName: 'Bob', status: 'unsubscribed', tags: [] }),
  ];

  return {
    createContact: vi.fn(async (input: CreateContactInput) => {
      const contact = makeContact({
        id: `c${contacts.length + 1}`,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        tags: input.tags ?? [],
        customFields: input.customFields ?? {},
      });
      contacts.push(contact);
      return contact;
    }),
    getContact: vi.fn(async (id: string) => contacts.find((c) => c.id === id) ?? null),
    getContactByEmail: vi.fn(async (email: string) => contacts.find((c) => c.email === email) ?? null),
    listContacts: vi.fn(async (options) => {
      let filtered = [...contacts];
      if (options?.status) {
        filtered = filtered.filter((c) => c.status === options.status);
      }
      if (options?.search) {
        filtered = filtered.filter((c) => c.email.includes(options.search!));
      }
      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 50;
      const start = (page - 1) * pageSize;
      return {
        data: filtered.slice(start, start + pageSize),
        total: filtered.length,
      };
    }),
    updateContact: vi.fn(async (id: string, input) => {
      const idx = contacts.findIndex((c) => c.id === id);
      if (idx < 0) throw new Error('Not found');
      const updated = { ...contacts[idx]!, ...input, updatedAt: new Date().toISOString() };
      contacts[idx] = updated;
      return updated;
    }),
    deleteContact: vi.fn(async (id: string) => {
      const idx = contacts.findIndex((c) => c.id === id);
      if (idx >= 0) contacts.splice(idx, 1);
    }),
    bulkCreateContacts: vi.fn(async (inputs: CreateContactInput[]) => {
      let created = 0;
      let updated = 0;
      for (const input of inputs) {
        const existing = contacts.find((c) => c.email === input.email);
        if (existing) {
          updated++;
        } else {
          contacts.push(makeContact({ id: `c${contacts.length + 1}`, ...input, tags: input.tags ?? [], customFields: input.customFields ?? {} }));
          created++;
        }
      }
      return { created, updated };
    }),
    createSegment: vi.fn(async (name: string, rules: SegmentRule[]) => ({
      id: 's1',
      name,
      rules,
      contactCount: 0,
      createdAt: new Date().toISOString(),
    })),
    listSegments: vi.fn(async () => []),
    getSegmentContacts: vi.fn(async () => ({ data: [], total: 0 })),
    deleteSegment: vi.fn(async () => {}),
    recordUnsubscribe: vi.fn(async () => {}),
    isUnsubscribed: vi.fn(async (id: string) => {
      const c = contacts.find((c) => c.id === id);
      return c?.status === 'unsubscribed';
    }),
  };
}

describe('ContactStorageAdapter (mock integration)', () => {
  let adapter: ContactStorageAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('should create a contact', async () => {
    const contact = await adapter.createContact({
      email: 'new@test.com',
      firstName: 'New',
    });
    expect(contact.email).toBe('new@test.com');
    expect(contact.firstName).toBe('New');
  });

  it('should get a contact by id', async () => {
    const contact = await adapter.getContact('c1');
    expect(contact).not.toBeNull();
    expect(contact!.email).toBe('john@example.com');
  });

  it('should return null for missing contact', async () => {
    const contact = await adapter.getContact('nonexistent');
    expect(contact).toBeNull();
  });

  it('should get a contact by email', async () => {
    const contact = await adapter.getContactByEmail('jane@example.com');
    expect(contact).not.toBeNull();
    expect(contact!.firstName).toBe('Jane');
  });

  it('should list contacts with pagination', async () => {
    const result = await adapter.listContacts({ page: 1, pageSize: 2 });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('should filter contacts by status', async () => {
    const result = await adapter.listContacts({ status: 'active' });
    expect(result.data.every((c) => c.status === 'active')).toBe(true);
  });

  it('should search contacts', async () => {
    const result = await adapter.listContacts({ search: 'example' });
    expect(result.data).toHaveLength(2);
  });

  it('should update a contact', async () => {
    const updated = await adapter.updateContact('c1', { firstName: 'Jonathan' });
    expect(updated.firstName).toBe('Jonathan');
  });

  it('should delete a contact', async () => {
    await adapter.deleteContact('c1');
    const contact = await adapter.getContact('c1');
    expect(contact).toBeNull();
  });

  it('should bulk create contacts with upsert', async () => {
    const result = await adapter.bulkCreateContacts([
      { email: 'john@example.com', firstName: 'John Updated' }, // existing
      { email: 'newuser@test.com', firstName: 'New' }, // new
    ]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
  });

  it('should create a segment', async () => {
    const segment = await adapter.createSegment('Active users', [
      { field: 'status', operator: 'equals', value: 'active' },
    ]);
    expect(segment.name).toBe('Active users');
    expect(segment.rules).toHaveLength(1);
  });

  it('should record unsubscribe', async () => {
    await adapter.recordUnsubscribe('c1', 'Not interested', 'link');
    expect(adapter.recordUnsubscribe).toHaveBeenCalledWith('c1', 'Not interested', 'link');
  });

  it('should check if contact is unsubscribed', async () => {
    expect(await adapter.isUnsubscribed('c1')).toBe(false);
    expect(await adapter.isUnsubscribed('c3')).toBe(true);
  });
});
