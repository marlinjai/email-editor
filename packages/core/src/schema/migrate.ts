// packages/core/src/schema/migrate.ts
// Upgrade a persisted template document to the schema version this build understands

import { nanoid } from 'nanoid';
import type { z } from 'zod';
import type { EmailTemplate, Section, Wrapper } from './types';
import { EmailTemplateSchemaV1_0, EmailTemplateSchemaV1_1 } from './validation';

/**
 * The document schema version this build of the editor reads and writes.
 * A host that persists documents stores it next to the document, so a later
 * build can tell which migrations a stored document still needs.
 *
 * 1.1 (2026-09-19) added wrappers (`Wrapper`, `mj-wrapper`) at the top level.
 */
export const CURRENT_TEMPLATE_VERSION = '1.1' as const;

/**
 * Every schema version this build can read, oldest first. A version appears
 * here only once a migration step from it to the next version exists.
 */
export const SUPPORTED_TEMPLATE_VERSIONS: readonly string[] = ['1.0', CURRENT_TEMPLATE_VERSION];

export type TemplateMigrationErrorCode =
  /** The input is not a plain object, so it cannot be a template document. */
  | 'INVALID_INPUT'
  /** The document has no `version` field, or it is not a string. */
  | 'MISSING_VERSION'
  /** The version is not of the form `major.minor`, or is an older version this build has no migration for. */
  | 'UNSUPPORTED_VERSION'
  /** The document was written by a newer editor than this one: upgrade the editor packages. */
  | 'NEWER_VERSION'
  /** The version is supported, but the document does not match its schema. */
  | 'INVALID_DOCUMENT';

/**
 * Thrown by {@link migrateTemplate}. `code` says what went wrong so a host can
 * react (for example: prompt for an editor upgrade on `NEWER_VERSION`), and
 * `version` carries the version found in the document, when there was one.
 */
export class TemplateMigrationError extends Error {
  readonly code: TemplateMigrationErrorCode;
  readonly version: string | undefined;
  readonly issues: readonly { path: (string | number)[]; message: string }[];

  constructor(
    code: TemplateMigrationErrorCode,
    message: string,
    options: { version?: string; issues?: { path: (string | number)[]; message: string }[] } = {}
  ) {
    super(message);
    this.name = 'TemplateMigrationError';
    this.code = code;
    this.version = options.version;
    this.issues = options.issues ?? [];
  }
}

export function isTemplateMigrationError(error: unknown): error is TemplateMigrationError {
  return error instanceof TemplateMigrationError;
}

function parseVersion(version: string): [number, number] | null {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function compareVersions(a: [number, number], b: [number, number]): number {
  return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
}

/**
 * Bring a stored template document up to {@link CURRENT_TEMPLATE_VERSION}.
 *
 * For a current (1.1) document this is the identity: the same object is
 * returned, unchanged, after it has been validated against the schema. Fields
 * the schema does not describe are kept, because the document is returned as
 * stored, not as re-parsed.
 *
 * A 1.0 document is validated against the 1.0 schema, then taken to 1.1 by
 * {@link migrateV1_0ToV1_1}: a new object whose only change is the version,
 * unless a section carries the 1.0 `isWrapper` flag (a wrapper around exactly
 * one section, written by the first MJML import), which becomes a real wrapper
 * around that section. The input object is never changed.
 *
 * `id` is optional and never touched here: a document with an id keeps it, and
 * one without stays without. The editor store assigns an id when it opens an
 * id-less document (`createRootStore`, `createEditor`, `EmailEditorReact`), and
 * the snapshots it emits carry that id from then on.
 *
 * @throws {TemplateMigrationError} when the input is not a document, has no
 * version, carries a version this build cannot read (older without a
 * migration, malformed, or newer than this build), or fails validation.
 */
export function migrateTemplate(doc: unknown): EmailTemplate {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new TemplateMigrationError(
      'INVALID_INPUT',
      `Expected a template document object, received ${doc === null ? 'null' : Array.isArray(doc) ? 'an array' : typeof doc}.`
    );
  }

  const version = (doc as { version?: unknown }).version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new TemplateMigrationError(
      'MISSING_VERSION',
      'The template document has no "version" field, so its schema cannot be determined.'
    );
  }

  const parsed = parseVersion(version);
  if (!parsed) {
    throw new TemplateMigrationError(
      'UNSUPPORTED_VERSION',
      `Template schema version "${version}" is not of the form "major.minor".`,
      { version }
    );
  }

  const current = parseVersion(CURRENT_TEMPLATE_VERSION)!;
  if (compareVersions(parsed, current) > 0) {
    throw new TemplateMigrationError(
      'NEWER_VERSION',
      `Template schema version "${version}" is newer than this editor supports (${CURRENT_TEMPLATE_VERSION}). Upgrade the @marlinjai/email-editor packages to open it.`,
      { version }
    );
  }

  if (!SUPPORTED_TEMPLATE_VERSIONS.includes(version)) {
    throw new TemplateMigrationError(
      'UNSUPPORTED_VERSION',
      `Template schema version "${version}" is not supported and has no migration to ${CURRENT_TEMPLATE_VERSION}.`,
      { version }
    );
  }

  // Each step validates the document against its own version's schema, then
  // takes it one version forward.
  let next: unknown = doc;
  if (version === '1.0') {
    assertValid(EmailTemplateSchemaV1_0, next, version);
    next = migrateV1_0ToV1_1(next as V1_0Document);
  }

  assertValid(EmailTemplateSchemaV1_1, next, version);
  return next as EmailTemplate;
}

function assertValid(schema: z.ZodTypeAny, doc: unknown, version: string): void {
  const result = schema.safeParse(doc);
  if (result.success) return;
  const issues = result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  const first = issues[0];
  throw new TemplateMigrationError(
    'INVALID_DOCUMENT',
    `Template document does not match schema version ${version}: ${first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'unknown validation error'}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''}.`,
    { version, issues }
  );
}

type V1_0Section = Section & { isWrapper?: boolean };
type V1_0Document = Omit<EmailTemplate, 'version' | 'sections'> & { version: '1.0'; sections: V1_0Section[] };

/**
 * 1.0 to 1.1. The content is unchanged (the same section objects, in the same
 * order) except for a section with `isWrapper: true`: in 1.0 that meant "emit
 * this section inside an `mj-wrapper` carrying the section's own attributes",
 * so it becomes a wrapper with the section's id and those attributes, around
 * one plain section holding its columns. The mail it compiles to is
 * equivalent: the wrapper renders the same, and the inner section, which had
 * no attributes in 1.0, still has none (it gains only its `el-section` class).
 */
export function migrateV1_0ToV1_1(doc: V1_0Document): EmailTemplate {
  if (!doc.sections.some((s) => s.isWrapper === true && !s.bodyRaw)) {
    return { ...doc, version: '1.1', sections: doc.sections.map(stripIsWrapper) };
  }
  const ids = new Set<string>();
  for (const s of doc.sections) {
    ids.add(s.id);
    for (const c of s.columns ?? []) {
      ids.add(c.id);
      for (const b of c.blocks ?? []) ids.add(b.id);
    }
  }
  const freshId = (base: string) => {
    let candidate = `${base}-inner`;
    for (let n = 2; ids.has(candidate); n++) candidate = `${base}-inner-${n}`;
    ids.add(candidate);
    return candidate;
  };
  const sections = doc.sections.map((s): Section | Wrapper => {
    // A body-level raw section ignores isWrapper when compiling (see the compiler), so it stays a section.
    if (s.isWrapper !== true || s.bodyRaw) return stripIsWrapper(s);
    const { isWrapper: _flag, noStack: _noStack, ...rest } = s;
    const wrapper: Wrapper = { id: s.id, type: 'wrapper', sections: [{ id: freshId(s.id), type: 'section', columns: s.columns }] };
    // The 1.0 compiler put every section attribute on the mj-wrapper and ignored noStack.
    if (rest.hidden !== undefined) wrapper.hidden = rest.hidden;
    if (rest.backgroundColor !== undefined) wrapper.backgroundColor = rest.backgroundColor;
    if (rest.backgroundImage !== undefined) wrapper.backgroundImage = rest.backgroundImage;
    if (rest.backgroundGradient !== undefined) wrapper.backgroundGradient = rest.backgroundGradient;
    if (rest.backgroundPosition !== undefined) wrapper.backgroundPosition = rest.backgroundPosition;
    if (rest.backgroundRepeat !== undefined) wrapper.backgroundRepeat = rest.backgroundRepeat;
    if (rest.backgroundSize !== undefined) wrapper.backgroundSize = rest.backgroundSize;
    if (rest.fullWidth !== undefined) wrapper.fullWidth = rest.fullWidth;
    if (rest.padding !== undefined) wrapper.padding = rest.padding;
    if (rest.extraAttributes !== undefined) wrapper.extraAttributes = rest.extraAttributes;
    return wrapper;
  });
  return { ...doc, version: '1.1', sections };
}

/** `isWrapper: false` (or absent) carries no meaning in 1.1: the key goes, nothing else changes. */
function stripIsWrapper(s: V1_0Section): Section {
  if (!('isWrapper' in s)) return s;
  const { isWrapper: _flag, ...rest } = s;
  return rest;
}

/**
 * The document with an id: the same object when it already has a non-empty
 * one, otherwise a shallow copy with a fresh id. The caller's object is never
 * changed. Hosts that hold on to the document the editor opened (such as
 * `createEditor`'s `getValue`) use this so that what they hand back carries the
 * id the editor works with, even before the first edit.
 */
export function withTemplateId<T extends { id?: string }>(doc: T): T & { id: string } {
  if (typeof doc.id === 'string' && doc.id.length > 0) return doc as T & { id: string };
  return { ...doc, id: nanoid() };
}
