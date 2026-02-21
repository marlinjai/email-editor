import type { CSVFieldMapping, CSVImportResult, CreateContactInput, ContactStorageAdapter } from './types';

/**
 * Parse CSV content into rows of string values.
 * Handles quoted fields, different delimiters, and newlines within quotes.
 */
export function parseCSV(content: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      currentField += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }

    if (char === '\n' || (char === '\r' && content[i + 1] === '\n')) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i += char === '\r' ? 2 : 1;
      continue;
    }

    currentField += char;
    i++;
  }

  // Handle last field/row
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Detect the delimiter used in CSV content.
 */
export function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  const delimiters = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let maxCount = 0;

  for (const d of delimiters) {
    const count = firstLine.split(d).length - 1;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = d;
    }
  }

  return bestDelimiter;
}

/**
 * Detect CSV columns from parsed header row.
 */
export function detectColumns(headers: string[]): string[] {
  return headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
}

/**
 * Suggest field mappings based on column names.
 */
export function suggestMappings(columns: string[]): Partial<CSVFieldMapping> {
  const mapping: Partial<CSVFieldMapping> = {};
  const lower = columns.map((c) => c.toLowerCase().replace(/\s+/g, '_'));

  for (let i = 0; i < lower.length; i++) {
    const col = lower[i]!;
    const original = columns[i]!;
    if (['email', 'e-mail', 'email_address', 'e_mail'].includes(col)) {
      mapping.email = original;
    } else if (['first_name', 'firstname', 'first', 'given_name'].includes(col)) {
      mapping.firstName = original;
    } else if (['last_name', 'lastname', 'last', 'surname', 'family_name'].includes(col)) {
      mapping.lastName = original;
    } else if (['tags', 'tag', 'labels'].includes(col)) {
      mapping.tags = original;
    }
  }

  return mapping;
}

/**
 * Validate that the email field mapping exists and points to a valid column.
 */
function validateMapping(mapping: CSVFieldMapping, headers: string[]): string | null {
  if (!mapping.email) {
    return 'Email field mapping is required';
  }
  if (!headers.includes(mapping.email)) {
    return `Email column "${mapping.email}" not found in CSV headers`;
  }
  return null;
}

/**
 * Simple email format validation.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Import contacts from parsed CSV data using the provided adapter and field mapping.
 */
export async function importCSV(
  csvContent: string,
  mapping: CSVFieldMapping,
  adapter: ContactStorageAdapter,
  delimiter?: string,
): Promise<CSVImportResult> {
  const detectedDelimiter = delimiter ?? detectDelimiter(csvContent);
  const rows = parseCSV(csvContent, detectedDelimiter);

  if (rows.length < 2) {
    return { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };
  }

  const headers = rows[0]!;
  const validationError = validateMapping(mapping, headers);
  if (validationError) {
    return {
      total: rows.length - 1,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, error: validationError }],
    };
  }

  const emailIdx = headers.indexOf(mapping.email);
  const firstNameIdx = mapping.firstName ? headers.indexOf(mapping.firstName) : -1;
  const lastNameIdx = mapping.lastName ? headers.indexOf(mapping.lastName) : -1;
  const tagsIdx = mapping.tags ? headers.indexOf(mapping.tags) : -1;

  // Collect custom field indices
  const customFieldIndices: Array<{ key: string; idx: number }> = [];
  for (const [key, colName] of Object.entries(mapping)) {
    if (['email', 'firstName', 'lastName', 'tags'].includes(key)) continue;
    if (colName) {
      const idx = headers.indexOf(colName);
      if (idx >= 0) {
        customFieldIndices.push({ key, idx });
      }
    }
  }

  const result: CSVImportResult = {
    total: rows.length - 1,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const dataRows = rows.slice(1);
  const BATCH_SIZE = 50;

  for (let batchStart = 0; batchStart < dataRows.length; batchStart += BATCH_SIZE) {
    const batch = dataRows.slice(batchStart, batchStart + BATCH_SIZE);
    const contacts: CreateContactInput[] = [];

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i]!;
      const rowNum = batchStart + i + 1; // 1-indexed, skipping header

      const email = row[emailIdx]?.trim() ?? '';
      if (!email) {
        result.errors.push({ row: rowNum, error: 'Missing email' });
        result.skipped++;
        continue;
      }

      if (!isValidEmail(email)) {
        result.errors.push({ row: rowNum, error: `Invalid email: ${email}` });
        result.skipped++;
        continue;
      }

      const contact: CreateContactInput = { email };

      if (firstNameIdx >= 0 && row[firstNameIdx]) {
        contact.firstName = row[firstNameIdx]!.trim();
      }
      if (lastNameIdx >= 0 && row[lastNameIdx]) {
        contact.lastName = row[lastNameIdx]!.trim();
      }
      if (tagsIdx >= 0 && row[tagsIdx]) {
        contact.tags = row[tagsIdx]!.split(',').map((t) => t.trim()).filter(Boolean);
      }

      if (customFieldIndices.length > 0) {
        contact.customFields = {};
        for (const { key, idx } of customFieldIndices) {
          if (row[idx]) {
            contact.customFields[key] = row[idx]!.trim();
          }
        }
      }

      contacts.push(contact);
    }

    if (contacts.length > 0) {
      try {
        const batchResult = await adapter.bulkCreateContacts(contacts);
        result.created += batchResult.created;
        result.updated += batchResult.updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Mark all contacts in this batch as errored
        for (let i = 0; i < batch.length; i++) {
          result.errors.push({ row: batchStart + i + 1, error: message });
        }
        result.skipped += contacts.length;
      }
    }
  }

  return result;
}
