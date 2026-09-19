import { MAX_DOCUMENT_BYTES } from '@marlinjai/mail-contract';
import { isTemplateMigrationError, migrateTemplate, type EmailTemplate } from '@marlinjai/email-editor-core';
import { ApiError } from './api-error.js';

/**
 * Every document the service stores or compiles passes through here: the
 * editor core's `migrateTemplate` validates it against the full block schema
 * (the contract only checks the envelope) and brings it to the schema version
 * this build understands.
 *
 * A rejected document is `validation_failed` with the core's reason in
 * `details.reason` (`INVALID_DOCUMENT`, `NEWER_VERSION`, `UNSUPPORTED_VERSION`,
 * `MISSING_VERSION`, `INVALID_INPUT`), so a client can tell "fix the document"
 * from "upgrade the editor packages", and `details.issues` with paths relative
 * to the request body.
 */
export function validateDocument(document: unknown, at: (string | number)[] = ['document']): EmailTemplate {
  const bytes = Buffer.byteLength(JSON.stringify(document) ?? '', 'utf8');
  if (bytes > MAX_DOCUMENT_BYTES) {
    throw new ApiError('payload_too_large', `The document is ${bytes} bytes; the limit is ${MAX_DOCUMENT_BYTES}.`, {
      limit_bytes: MAX_DOCUMENT_BYTES,
    });
  }
  // Defense in depth behind the compiler's `ignoreIncludes`: a document never
  // carries an <mj-include> (its path would be read from the server's disk).
  if (/<\s*mj-include\b/i.test(JSON.stringify(document) ?? '')) {
    throw new ApiError('validation_failed', 'A document may not contain <mj-include>.', {
      reason: 'INVALID_DOCUMENT',
      issues: [{ path: at, message: 'A document may not contain <mj-include>.' }],
    });
  }
  try {
    return migrateTemplate(document);
  } catch (err) {
    if (!isTemplateMigrationError(err)) throw err;
    throw new ApiError('validation_failed', err.message, {
      reason: err.code,
      ...(err.version !== undefined ? { document_version: err.version } : {}),
      issues: err.issues.length > 0 ? err.issues.map((i) => ({ path: [...at, ...i.path], message: i.message })) : [{ path: at, message: err.message }],
    });
  }
}

/**
 * The schema version a document declares. Only called on documents that passed
 * `validateDocument`, so the field exists.
 */
export function schemaVersionOf(document: EmailTemplate): string {
  return document.version;
}
