import { describe, it, expect, vi } from 'vitest';
import { parseCSV, detectDelimiter, detectColumns, suggestMappings, importCSV } from '../csv-importer';
import type { ContactStorageAdapter } from '../types';

describe('parseCSV', () => {
  it('should parse simple CSV', () => {
    const csv = 'email,name\njohn@test.com,John\njane@test.com,Jane';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'John'],
      ['jane@test.com', 'Jane'],
    ]);
  });

  it('should handle quoted fields', () => {
    const csv = 'email,name\njohn@test.com,"Doe, John"\njane@test.com,"Smith, Jane"';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'Doe, John'],
      ['jane@test.com', 'Smith, Jane'],
    ]);
  });

  it('should handle escaped quotes', () => {
    const csv = 'email,name\njohn@test.com,"He said ""hello"""\njane@test.com,Jane';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'He said "hello"'],
      ['jane@test.com', 'Jane'],
    ]);
  });

  it('should handle different delimiters', () => {
    const csv = 'email;name\njohn@test.com;John\njane@test.com;Jane';
    const result = parseCSV(csv, ';');
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'John'],
      ['jane@test.com', 'Jane'],
    ]);
  });

  it('should handle CRLF line endings', () => {
    const csv = 'email,name\r\njohn@test.com,John\r\njane@test.com,Jane';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'John'],
      ['jane@test.com', 'Jane'],
    ]);
  });

  it('should handle newlines within quoted fields', () => {
    const csv = 'email,notes\njohn@test.com,"line 1\nline 2"\njane@test.com,simple';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'notes'],
      ['john@test.com', 'line 1\nline 2'],
      ['jane@test.com', 'simple'],
    ]);
  });

  it('should skip empty rows', () => {
    const csv = 'email,name\n\njohn@test.com,John\n\n';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'John'],
    ]);
  });

  it('should trim whitespace from fields', () => {
    const csv = 'email , name \n john@test.com , John ';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['email', 'name'],
      ['john@test.com', 'John'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('should detect comma', () => {
    expect(detectDelimiter('email,name,age')).toBe(',');
  });

  it('should detect semicolon', () => {
    expect(detectDelimiter('email;name;age')).toBe(';');
  });

  it('should detect tab', () => {
    expect(detectDelimiter('email\tname\tage')).toBe('\t');
  });

  it('should detect pipe', () => {
    expect(detectDelimiter('email|name|age')).toBe('|');
  });
});

describe('detectColumns', () => {
  it('should normalize column names', () => {
    expect(detectColumns(['Email', 'First Name', 'Last  Name'])).toEqual([
      'email',
      'first_name',
      'last_name',
    ]);
  });
});

describe('suggestMappings', () => {
  it('should map common column names', () => {
    const result = suggestMappings(['Email', 'First Name', 'Last Name', 'Tags']);
    expect(result).toEqual({
      email: 'Email',
      firstName: 'First Name',
      lastName: 'Last Name',
      tags: 'Tags',
    });
  });

  it('should handle alternative names', () => {
    const result = suggestMappings(['e-mail', 'firstname', 'surname', 'labels']);
    expect(result).toEqual({
      email: 'e-mail',
      firstName: 'firstname',
      lastName: 'surname',
      tags: 'labels',
    });
  });

  it('should handle missing columns', () => {
    const result = suggestMappings(['Email', 'Company']);
    expect(result).toEqual({ email: 'Email' });
  });
});

describe('importCSV', () => {
  function createMockAdapter(): ContactStorageAdapter {
    return {
      createContact: vi.fn().mockResolvedValue({ id: '1', email: '', status: 'active', tags: [], customFields: {}, createdAt: '', updatedAt: '' }),
      getContact: vi.fn().mockResolvedValue(null),
      getContactByEmail: vi.fn().mockResolvedValue(null),
      listContacts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      updateContact: vi.fn().mockResolvedValue({}),
      deleteContact: vi.fn().mockResolvedValue(undefined),
      bulkCreateContacts: vi.fn().mockResolvedValue({ created: 2, updated: 0 }),
      createSegment: vi.fn().mockResolvedValue({}),
      listSegments: vi.fn().mockResolvedValue([]),
      getSegmentContacts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      deleteSegment: vi.fn().mockResolvedValue(undefined),
      recordUnsubscribe: vi.fn().mockResolvedValue(undefined),
      isUnsubscribed: vi.fn().mockResolvedValue(false),
    };
  }

  it('should import valid CSV', async () => {
    const adapter = createMockAdapter();
    const csv = 'Email,First Name,Last Name\njohn@test.com,John,Doe\njane@test.com,Jane,Smith';
    const mapping = { email: 'Email', firstName: 'First Name', lastName: 'Last Name' };

    const result = await importCSV(csv, mapping, adapter);

    expect(result.total).toBe(2);
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(adapter.bulkCreateContacts).toHaveBeenCalledOnce();
  });

  it('should skip rows with missing email', async () => {
    const adapter = createMockAdapter();
    (adapter.bulkCreateContacts as ReturnType<typeof vi.fn>).mockResolvedValue({ created: 1, updated: 0 });
    const csv = 'Email,Name\njohn@test.com,John\n,Jane';
    const mapping = { email: 'Email' };

    const result = await importCSV(csv, mapping, adapter);

    expect(result.total).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toBe('Missing email');
  });

  it('should skip rows with invalid email', async () => {
    const adapter = createMockAdapter();
    (adapter.bulkCreateContacts as ReturnType<typeof vi.fn>).mockResolvedValue({ created: 1, updated: 0 });
    const csv = 'Email,Name\njohn@test.com,John\nnot-an-email,Jane';
    const mapping = { email: 'Email' };

    const result = await importCSV(csv, mapping, adapter);

    expect(result.skipped).toBe(1);
    expect(result.errors[0]!.error).toContain('Invalid email');
  });

  it('should return error if email mapping is missing', async () => {
    const adapter = createMockAdapter();
    const csv = 'Email,Name\njohn@test.com,John';
    const mapping = { email: 'NonExistent' };

    const result = await importCSV(csv, mapping, adapter);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain('not found');
  });

  it('should handle empty CSV', async () => {
    const adapter = createMockAdapter();
    const result = await importCSV('', { email: 'Email' }, adapter);
    expect(result.total).toBe(0);
  });

  it('should parse tags from comma-separated values', async () => {
    const adapter = createMockAdapter();
    const csv = 'Email,Tags\njohn@test.com,"vip,newsletter"';
    const mapping = { email: 'Email', tags: 'Tags' };

    await importCSV(csv, mapping, adapter);

    expect(adapter.bulkCreateContacts).toHaveBeenCalledWith([
      expect.objectContaining({
        email: 'john@test.com',
        tags: ['vip', 'newsletter'],
      }),
    ]);
  });
});
