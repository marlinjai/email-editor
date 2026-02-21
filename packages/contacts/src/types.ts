export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained';

export interface Contact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  status: ContactStatus;
  tags: string[];
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  rules: SegmentRule[];
  contactCount: number;
  createdAt: string;
}

export type SegmentOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than';

export interface SegmentRule {
  field: string;
  operator: SegmentOperator;
  value: string;
}

export interface SegmentGroup {
  logic: 'and' | 'or';
  rules: SegmentRule[];
}

export interface Unsubscribe {
  id: string;
  contactId: string;
  reason?: string;
  method: 'link' | 'manual' | 'admin' | 'api';
  unsubscribedAt: string;
}

export interface CreateContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

export interface UpdateContactInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: ContactStatus;
  tags?: string[];
  customFields?: Record<string, string>;
}

export interface ContactListOptions {
  status?: ContactStatus;
  tags?: string[];
  search?: string;
  segmentId?: string;
  page?: number;
  pageSize?: number;
}

export interface CSVImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface CSVFieldMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string;
  [customField: string]: string | undefined;
}

export interface ContactStorageAdapter {
  createContact(input: CreateContactInput): Promise<Contact>;
  getContact(id: string): Promise<Contact | null>;
  getContactByEmail(email: string): Promise<Contact | null>;
  listContacts(options?: ContactListOptions): Promise<{ data: Contact[]; total: number }>;
  updateContact(id: string, input: UpdateContactInput): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  bulkCreateContacts(contacts: CreateContactInput[]): Promise<{ created: number; updated: number }>;
  createSegment(name: string, rules: SegmentRule[], description?: string): Promise<Segment>;
  listSegments(): Promise<Segment[]>;
  getSegmentContacts(segmentId: string, options?: ContactListOptions): Promise<{ data: Contact[]; total: number }>;
  deleteSegment(id: string): Promise<void>;
  recordUnsubscribe(contactId: string, reason?: string, method?: Unsubscribe['method']): Promise<void>;
  isUnsubscribed(contactId: string): Promise<boolean>;
}
