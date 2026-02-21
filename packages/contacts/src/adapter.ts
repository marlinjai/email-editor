import type { DataBrain, Row, CellValue } from '@marlinjai/data-brain-sdk';
import type {
  Contact,
  ContactListOptions,
  ContactStorageAdapter,
  CreateContactInput,
  Segment,
  SegmentRule,
  Unsubscribe,
  UpdateContactInput,
} from './types';
import { evaluateRules } from './segment-evaluator';

/**
 * Configuration for the Data Brain contact adapter.
 */
export interface DataBrainContactAdapterConfig {
  client: DataBrain;
  /** Table ID for the contacts table in Data Brain */
  contactsTableId: string;
  /** Table ID for the segments table in Data Brain */
  segmentsTableId: string;
  /** Table ID for the unsubscribes table in Data Brain */
  unsubscribesTableId: string;
}

/**
 * Maps a Data Brain Row to a Contact object.
 */
function rowToContact(row: Row): Contact {
  const cells = row.cells;
  return {
    id: row.id,
    email: String(cells.email ?? ''),
    firstName: cells.first_name ? String(cells.first_name) : undefined,
    lastName: cells.last_name ? String(cells.last_name) : undefined,
    status: (String(cells.status ?? 'active')) as Contact['status'],
    tags: Array.isArray(cells.tags) ? cells.tags.map(String) : [],
    customFields: parseCustomFields(cells.custom_fields),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function parseCustomFields(value: CellValue | undefined): Record<string, string> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Maps a Data Brain Row to a Segment object.
 */
function rowToSegment(row: Row): Segment {
  const cells = row.cells;
  let rules: SegmentRule[] = [];
  try {
    const rulesStr = String(cells.rules_json ?? '[]');
    rules = JSON.parse(rulesStr);
  } catch {
    rules = [];
  }
  return {
    id: row.id,
    name: String(cells.name ?? ''),
    description: cells.description ? String(cells.description) : undefined,
    rules,
    contactCount: Number(cells.contact_count ?? 0),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/**
 * Data Brain-backed implementation of ContactStorageAdapter.
 */
export class DataBrainContactAdapter implements ContactStorageAdapter {
  private client: DataBrain;
  private contactsTableId: string;
  private segmentsTableId: string;
  private unsubscribesTableId: string;

  constructor(config: DataBrainContactAdapterConfig) {
    this.client = config.client;
    this.contactsTableId = config.contactsTableId;
    this.segmentsTableId = config.segmentsTableId;
    this.unsubscribesTableId = config.unsubscribesTableId;
  }

  async createContact(input: CreateContactInput): Promise<Contact> {
    const row = await this.client.createRow({
      tableId: this.contactsTableId,
      cells: {
        email: input.email,
        first_name: input.firstName ?? '',
        last_name: input.lastName ?? '',
        status: 'active',
        tags: input.tags ?? [],
        custom_fields: JSON.stringify(input.customFields ?? {}),
      },
    });
    return rowToContact(row);
  }

  async getContact(id: string): Promise<Contact | null> {
    const row = await this.client.getRow(id);
    if (!row) return null;
    return rowToContact(row);
  }

  async getContactByEmail(email: string): Promise<Contact | null> {
    const result = await this.client.getRows(this.contactsTableId, {
      filters: [{ columnId: 'email', operator: 'eq' as never, value: email as never }],
      limit: 1,
    });
    if (result.items.length === 0) return null;
    return rowToContact(result.items[0]!);
  }

  async listContacts(options?: ContactListOptions): Promise<{ data: Contact[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const filters: Array<{ columnId: string; operator: string; value: unknown }> = [];

    if (options?.status) {
      filters.push({ columnId: 'status', operator: 'eq', value: options.status });
    }
    if (options?.search) {
      filters.push({ columnId: 'email', operator: 'contains', value: options.search });
    }

    const result = await this.client.getRows(this.contactsTableId, {
      limit: pageSize,
      offset,
      filters: filters as never,
    });

    return {
      data: result.items.map((r) => rowToContact(r)),
      total: result.total,
    };
  }

  async updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
    const cells: Record<string, CellValue> = {};
    if (input.email !== undefined) cells.email = input.email;
    if (input.firstName !== undefined) cells.first_name = input.firstName;
    if (input.lastName !== undefined) cells.last_name = input.lastName;
    if (input.status !== undefined) cells.status = input.status;
    if (input.tags !== undefined) cells.tags = input.tags;
    if (input.customFields !== undefined) cells.custom_fields = JSON.stringify(input.customFields);

    const row = await this.client.updateRow(id, cells);
    return rowToContact(row);
  }

  async deleteContact(id: string): Promise<void> {
    await this.client.deleteRow(id);
  }

  async bulkCreateContacts(contacts: CreateContactInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const input of contacts) {
      const existing = await this.getContactByEmail(input.email);
      if (existing) {
        await this.updateContact(existing.id, {
          firstName: input.firstName,
          lastName: input.lastName,
          tags: input.tags,
          customFields: input.customFields,
        });
        updated++;
      } else {
        await this.createContact(input);
        created++;
      }
    }

    return { created, updated };
  }

  async createSegment(name: string, rules: SegmentRule[], description?: string): Promise<Segment> {
    const allContacts = await this.listContacts({ pageSize: 1000 });
    const matchCount = allContacts.data.filter((c) => evaluateRules(c, rules)).length;

    const row = await this.client.createRow({
      tableId: this.segmentsTableId,
      cells: {
        name,
        description: description ?? '',
        rules_json: JSON.stringify(rules),
        contact_count: matchCount,
      },
    });

    return rowToSegment(row);
  }

  async listSegments(): Promise<Segment[]> {
    const result = await this.client.getRows(this.segmentsTableId, { limit: 100 });
    return result.items.map((r) => rowToSegment(r));
  }

  async getSegmentContacts(segmentId: string, options?: ContactListOptions): Promise<{ data: Contact[]; total: number }> {
    const segmentRow = await this.client.getRow(segmentId);
    if (!segmentRow) {
      return { data: [], total: 0 };
    }
    const segment = rowToSegment(segmentRow);

    const allContacts = await this.listContacts({ ...options, pageSize: 1000 });
    const matching = allContacts.data.filter((c) => evaluateRules(c, segment.rules));

    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 50;
    const start = (page - 1) * pageSize;

    return {
      data: matching.slice(start, start + pageSize),
      total: matching.length,
    };
  }

  async deleteSegment(id: string): Promise<void> {
    await this.client.deleteRow(id);
  }

  async recordUnsubscribe(contactId: string, reason?: string, method: Unsubscribe['method'] = 'manual'): Promise<void> {
    await this.client.createRow({
      tableId: this.unsubscribesTableId,
      cells: {
        contact_id: contactId,
        reason: reason ?? '',
        method,
      },
    });
  }

  async isUnsubscribed(contactId: string): Promise<boolean> {
    const contact = await this.getContact(contactId);
    return contact?.status === 'unsubscribed';
  }
}
