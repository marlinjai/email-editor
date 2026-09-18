import { describe, it, expect } from 'vitest';
import {
  migrateTemplate,
  TemplateMigrationError,
  isTemplateMigrationError,
  CURRENT_TEMPLATE_VERSION,
} from '../migrate';

function expectMigrationError(input: unknown, code: string, version?: string) {
  let caught: unknown;
  try {
    migrateTemplate(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TemplateMigrationError);
  expect(isTemplateMigrationError(caught)).toBe(true);
  const error = caught as TemplateMigrationError;
  expect(error.code).toBe(code);
  expect(error.name).toBe('TemplateMigrationError');
  expect(error.version).toBe(version);
  return error;
}

const validDoc = {
  id: 'tpl-1',
  version: '1.0',
  metadata: { title: 'Hello', subject: 'Hi' },
  sections: [
    {
      id: 'sec-1',
      type: 'section',
      columns: [{ id: 'col-1', blocks: [{ id: 'b1', type: 'text', content: '<p>Hi</p>' }] }],
    },
  ],
};

describe('migrateTemplate', () => {
  it('reports 1.0 as the current version', () => {
    expect(CURRENT_TEMPLATE_VERSION).toBe('1.0');
  });

  it('is the identity for a valid 1.0 document: same object, nothing stripped', () => {
    const input = structuredClone(validDoc);
    const out = migrateTemplate(input);
    expect(out).toBe(input);
    expect(out).toEqual(validDoc);
    expect((out as unknown as { id: string }).id).toBe('tpl-1');
  });

  it('is idempotent: migrating a migrated document changes nothing', () => {
    const once = migrateTemplate(structuredClone(validDoc));
    expect(migrateTemplate(once)).toEqual(validDoc);
  });

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['{"version":"1.0"}', 'string'],
    [42, 'number'],
    [[validDoc], 'array'],
  ])('rejects non-object input (%s) with INVALID_INPUT', (input) => {
    expectMigrationError(input, 'INVALID_INPUT');
  });

  it('rejects a document without a version with MISSING_VERSION', () => {
    const { version: _drop, ...noVersion } = validDoc;
    expectMigrationError(noVersion, 'MISSING_VERSION');
  });

  it('rejects a numeric version with MISSING_VERSION', () => {
    expectMigrationError({ ...validDoc, version: 1 }, 'MISSING_VERSION');
  });

  it('rejects an empty version with MISSING_VERSION', () => {
    expectMigrationError({ ...validDoc, version: '' }, 'MISSING_VERSION');
  });

  it.each(['2.0', '1.1', '10.0'])('rejects a newer version (%s) with NEWER_VERSION', (version) => {
    const error = expectMigrationError({ ...validDoc, version }, 'NEWER_VERSION', version);
    expect(error.message).toContain('Upgrade');
  });

  it('compares versions numerically, not as strings', () => {
    // "1.10" sorts before "1.9" as a string but is newer as a version.
    expectMigrationError({ ...validDoc, version: '1.10' }, 'NEWER_VERSION', '1.10');
  });

  it.each(['0.9', '0.1'])('rejects an older version without a migration (%s) with UNSUPPORTED_VERSION', (version) => {
    expectMigrationError({ ...validDoc, version }, 'UNSUPPORTED_VERSION', version);
  });

  it.each(['v1', '1', '1.0.0', 'latest'])('rejects a malformed version (%s) with UNSUPPORTED_VERSION', (version) => {
    expectMigrationError({ ...validDoc, version }, 'UNSUPPORTED_VERSION', version);
  });

  it('rejects a 1.0 document that fails the schema with INVALID_DOCUMENT and lists the issues', () => {
    const error = expectMigrationError({ version: '1.0', sections: 'nope' }, 'INVALID_DOCUMENT', '1.0');
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues.some((issue) => issue.path[0] === 'metadata')).toBe(true);
    expect(error.message).toMatch(/does not match schema version 1\.0/);
  });

  it('does not mutate an invalid input', () => {
    const input = { version: '1.0', metadata: {}, sections: [{ id: 's', type: 'section', columns: [] }] };
    const before = structuredClone(input);
    expectMigrationError(input, 'INVALID_DOCUMENT', '1.0');
    expect(input).toEqual(before);
  });
});
