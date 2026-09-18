// packages/core/src/schema/migrate.ts
// Upgrade a persisted template document to the schema version this build understands

import type { EmailTemplate } from './types';
import { validateTemplate } from './validation';

/**
 * The document schema version this build of the editor reads and writes.
 * A host that persists documents stores it next to the document, so a later
 * build can tell which migrations a stored document still needs.
 */
export const CURRENT_TEMPLATE_VERSION = '1.0' as const;

/**
 * Every schema version this build can read, oldest first. A version appears
 * here only once a migration step from it to the next version exists.
 */
export const SUPPORTED_TEMPLATE_VERSIONS: readonly string[] = [CURRENT_TEMPLATE_VERSION];

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
 * For a `1.0` document this is the identity: the same object is returned,
 * unchanged, after it has been validated against the schema. Fields the
 * schema does not describe (such as the store's `id`) are kept, because the
 * document is returned as stored, not as re-parsed.
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

  // Migration steps from older versions go here, each one taking the
  // document one version forward, before the final validation below.

  const result = validateTemplate(doc);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
    const first = issues[0];
    throw new TemplateMigrationError(
      'INVALID_DOCUMENT',
      `Template document does not match schema version ${version}: ${first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'unknown validation error'}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''}.`,
      { version, issues }
    );
  }

  return doc as EmailTemplate;
}
