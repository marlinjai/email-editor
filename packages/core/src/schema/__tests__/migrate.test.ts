import { describe, it, expect } from 'vitest';
import {
  migrateTemplate,
  TemplateMigrationError,
  isTemplateMigrationError,
  CURRENT_TEMPLATE_VERSION,
  SUPPORTED_TEMPLATE_VERSIONS,
} from '../migrate';
import { validateTemplate } from '../validation';

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

const wrapperDoc = {
  id: 'tpl-2',
  version: '1.1',
  metadata: { title: 'Wrapped' },
  sections: [
    {
      id: 'wrap-1',
      type: 'wrapper',
      backgroundColor: '#ffffff',
      border: '1px solid #dddddd',
      borderTop: '4px solid #0b6e4f',
      borderRadius: '8px',
      padding: { top: '24px', right: '0', bottom: '24px', left: '0' },
      fullWidth: true,
      cssClass: 'card',
      gap: '16px',
      textAlign: 'left',
      extraAttributes: { direction: 'ltr' },
      sections: [validDoc.sections[0]],
    },
    { id: 'sec-2', type: 'section', columns: [{ id: 'col-2', blocks: [] }] },
  ],
};

describe('migrateTemplate', () => {
  it('reports 1.1 as the current version', () => {
    expect(CURRENT_TEMPLATE_VERSION).toBe('1.1');
    expect(SUPPORTED_TEMPLATE_VERSIONS).toEqual(['1.0', '1.1']);
  });

  it('takes a 1.0 document to 1.1 as an identity on content: only the version changes, the input is untouched', () => {
    const input = structuredClone(validDoc);
    const out = migrateTemplate(input);
    expect(out).not.toBe(input);
    expect(input).toEqual(validDoc);
    expect(out).toEqual({ ...validDoc, version: '1.1' });
    // The same section objects: nothing inside is copied or re-parsed.
    expect(out.sections[0]).toBe(input.sections[0]);
    expect((out as unknown as { id: string }).id).toBe('tpl-1');
  });

  it('keeps fields the schema does not describe when upgrading 1.0', () => {
    const input = { ...structuredClone(validDoc), hostField: { keep: true } };
    expect(migrateTemplate(input)).toMatchObject({ version: '1.1', hostField: { keep: true } });
  });

  it('is the identity for a valid 1.1 document with wrappers: same object, nothing stripped', () => {
    const input = structuredClone(wrapperDoc);
    const out = migrateTemplate(input);
    expect(out).toBe(input);
    expect(out).toEqual(wrapperDoc);
  });

  it('is idempotent: migrating a migrated document changes nothing', () => {
    const once = migrateTemplate(structuredClone(validDoc));
    expect(migrateTemplate(once)).toBe(once);
    expect(once).toEqual({ ...validDoc, version: '1.1' });
  });

  it('folds a 1.0 isWrapper section into a wrapper around one plain section', () => {
    const legacy = {
      version: '1.0',
      metadata: {},
      sections: [
        { id: 'a', type: 'section', columns: [{ id: 'ca', blocks: [] }] },
        {
          id: 'w',
          type: 'section',
          isWrapper: true,
          noStack: true,
          hidden: false,
          backgroundColor: '#eeeeee',
          backgroundImage: 'https://example.org/bg.png',
          backgroundPosition: 'top center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          fullWidth: true,
          padding: { top: '10px' },
          extraAttributes: { 'css-class': 'mine', 'border-radius': '4px' },
          columns: [{ id: 'cw', blocks: [{ id: 't', type: 'text', content: 'x' }] }],
        },
        { id: 'b', type: 'section', isWrapper: false, columns: [{ id: 'cb', blocks: [] }] },
      ],
    };
    const before = structuredClone(legacy);
    const out = migrateTemplate(legacy);
    expect(legacy).toEqual(before);
    expect(out.version).toBe('1.1');
    expect(out.sections).toEqual([
      legacy.sections[0],
      {
        id: 'w',
        type: 'wrapper',
        hidden: false,
        backgroundColor: '#eeeeee',
        backgroundImage: 'https://example.org/bg.png',
        backgroundPosition: 'top center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        fullWidth: true,
        padding: { top: '10px' },
        extraAttributes: { 'css-class': 'mine', 'border-radius': '4px' },
        sections: [{ id: 'w-inner', type: 'section', columns: legacy.sections[1]!.columns }],
      },
      // isWrapper: false means nothing in 1.1; only the key goes.
      { id: 'b', type: 'section', columns: [{ id: 'cb', blocks: [] }] },
    ]);
    expect(validateTemplate(out).success).toBe(true);
    // Deterministic, so a stored 1.0 document compiles to the same mail on every migration.
    expect(migrateTemplate(structuredClone(before))).toEqual(out);
  });

  it('picks an inner id that does not collide with an existing one', () => {
    const legacy = {
      version: '1.0',
      metadata: {},
      sections: [
        { id: 'w', type: 'section', isWrapper: true, columns: [{ id: 'w-inner', blocks: [] }] },
      ],
    };
    const out = migrateTemplate(legacy);
    expect((out.sections[0] as { sections: { id: string }[] }).sections[0]!.id).toBe('w-inner-2');
  });

  it('leaves a body-level raw section with isWrapper a section (the compiler ignored the flag for it)', () => {
    const legacy = {
      version: '1.0',
      metadata: {},
      sections: [{ id: 'r', type: 'section', isWrapper: true, bodyRaw: true, columns: [{ id: 'c', blocks: [{ id: 'x', type: 'raw', html: '<p>x</p>' }] }] }],
    };
    expect(migrateTemplate(legacy).sections).toEqual([
      { id: 'r', type: 'section', bodyRaw: true, columns: [{ id: 'c', blocks: [{ id: 'x', type: 'raw', html: '<p>x</p>' }] }] },
    ]);
  });

  it('refuses a wrapper in a 1.0 document (1.0 cannot hold one)', () => {
    const error = expectMigrationError({ ...structuredClone(wrapperDoc), version: '1.0' }, 'INVALID_DOCUMENT', '1.0');
    expect(error.issues.some((i) => i.path.join('.') === 'sections.0.type')).toBe(true);
  });

  it('refuses isWrapper in a 1.1 document', () => {
    const doc = { ...structuredClone(validDoc), version: '1.1', sections: [{ ...validDoc.sections[0], isWrapper: true }] };
    const error = expectMigrationError(doc, 'INVALID_DOCUMENT', '1.1');
    expect(error.issues[0]!.path).toEqual(['sections', 0, 'isWrapper']);
  });

  it.each([
    ['a wrapper inside a wrapper', { id: 'inner', type: 'wrapper', sections: [] }],
    ['a section without columns', { id: 's', type: 'section', columns: [] }],
  ])('refuses %s inside a wrapper', (_name, child) => {
    const doc = structuredClone(wrapperDoc) as { sections: { sections?: unknown[] }[] };
    doc.sections[0]!.sections = [child];
    expectMigrationError(doc, 'INVALID_DOCUMENT', '1.1');
  });

  it('accepts an empty wrapper: it keeps its styling, and sections can move back in', () => {
    const doc = structuredClone(wrapperDoc) as { sections: { sections?: unknown[] }[] };
    doc.sections[0]!.sections = [];
    expect(migrateTemplate(doc)).toBe(doc);
  });

  it.each(['16', '1em', '-4px', 'wide'])('refuses a gap that is not a px length (%s)', (gap) => {
    const doc = structuredClone(wrapperDoc) as { sections: { gap?: string }[] };
    doc.sections[0]!.gap = gap;
    expectMigrationError(doc, 'INVALID_DOCUMENT', '1.1');
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

  it.each(['2.0', '1.2', '10.0'])('rejects a newer version (%s) with NEWER_VERSION', (version) => {
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
