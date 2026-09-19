import { z } from 'zod';
import { Id, PageQuery, Timestamp } from './common';

/*
 * S1, editor and templates: template documents and their versions, compilation,
 * and uploaded assets.
 */

/** Oldest first. 1.1 (2026-09-19) added wrappers (a container around sections) at the top level. */
export const DOCUMENT_SCHEMA_VERSIONS = ['1.0', '1.1'] as const;
export const DocumentSchemaVersion = z.enum(DOCUMENT_SCHEMA_VERSIONS);
export type DocumentSchemaVersion = z.infer<typeof DocumentSchemaVersion>;

/**
 * The editor's template document (`EmailTemplate` in
 * `@marlinjai/email-editor-core`). The contract checks only the envelope, the
 * schema version, and that `sections` is a list (of sections, and from 1.1 of
 * wrappers around sections); the editor core owns the full block schema and
 * the service validates a document with it before storing or compiling. The
 * service stores a document as sent, in the version it was written in (a
 * client on a 1.0 editor reads back a 1.0 document), and compiles it at the
 * current version.
 * Importing the core here would pull the MJML compiler into an edge-safe package.
 *
 * `id` is optional and passes through unchanged: the service stores a document
 * exactly as sent, with or without one. The editor assigns an id when it opens
 * a document that has none and emits it from then on, so the first save after
 * opening such a document adds the id (and bumps the template's version once).
 */
export const TemplateDocument = z
  .object({
    version: DocumentSchemaVersion,
    metadata: z.record(z.unknown()),
    sections: z.array(z.record(z.unknown())),
  })
  .passthrough();
export type TemplateDocument = z.infer<typeof TemplateDocument>;

/** Documents are stored as JSON columns: the service refuses anything larger. */
export const MAX_DOCUMENT_BYTES = 1_000_000;

export const Template = z.object({
  id: Id,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  document: TemplateDocument,
  /** Increments on every saved change. */
  version: z.number().int().min(1),
  thumbnail_url: z.string().url().nullable(),
  archived_at: Timestamp.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Template = z.infer<typeof Template>;

/** A list entry: the same as a template, without the (large) document. */
export const TemplateSummary = Template.omit({ document: true });
export type TemplateSummary = z.infer<typeof TemplateSummary>;

export const TemplateCreate = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  document: TemplateDocument,
});
export type TemplateCreate = z.infer<typeof TemplateCreate>;

/**
 * Saving a template. `base_version` is the version the editor loaded; if the
 * template has moved on since, the save fails with `conflict` (409) instead of
 * silently overwriting another person's change.
 */
export const TemplateUpdate = z
  .object({
    base_version: z.number().int().min(1),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    document: TemplateDocument.optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined || v.document !== undefined || v.archived !== undefined,
    'at least one field besides base_version',
  );
export type TemplateUpdate = z.infer<typeof TemplateUpdate>;

export const TemplateListQuery = PageQuery.extend({
  archived: z.enum(['true', 'false']).optional(),
});
export type TemplateListQuery = z.infer<typeof TemplateListQuery>;

export const TemplateVersion = z.object({
  template_id: Id,
  version: z.number().int().min(1),
  document: TemplateDocument,
  created_by: z.string().nullable(),
  created_at: Timestamp,
});
export type TemplateVersion = z.infer<typeof TemplateVersion>;

export const TemplateVersionParams = z.object({
  id: Id,
  version: z.coerce.number().int().min(1),
});
export type TemplateVersionParams = z.infer<typeof TemplateVersionParams>;

// Compile

export const CompileMessage = z.object({
  message: z.string().min(1),
  /** Where in the document or the MJML the message points, when known. */
  path: z.string().optional(),
  line: z.number().int().min(1).optional(),
});
export type CompileMessage = z.infer<typeof CompileMessage>;

/**
 * The result of compiling a document. A compile that ran returns 200 even when
 * the document has problems: `errors` non-empty means `html` must not be sent
 * (sending such a mailing fails with `compile_failed`), `warnings` are shown but
 * do not block. Only an unreadable document is a 4xx.
 */
export const CompileResult = z.object({
  mjml: z.string(),
  html: z.string(),
  warnings: z.array(CompileMessage),
  errors: z.array(CompileMessage),
});
export type CompileResult = z.infer<typeof CompileResult>;

/** Compiling a saved template: optionally a past version. */
export const TemplateCompileRequest = z.object({
  version: z.number().int().min(1).optional(),
});
export type TemplateCompileRequest = z.infer<typeof TemplateCompileRequest>;

/** Compiling an unsaved document (the editor's live preview). */
export const CompileRequest = z.object({
  document: TemplateDocument,
});
export type CompileRequest = z.infer<typeof CompileRequest>;

// Assets

export const ASSET_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export const AssetContentType = z.enum(ASSET_CONTENT_TYPES);
export type AssetContentType = z.infer<typeof AssetContentType>;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

/**
 * An uploaded image. The upload is `multipart/form-data` with one `file` field;
 * a type outside `ASSET_CONTENT_TYPES` is `unsupported_media_type`, a file over
 * `MAX_ASSET_BYTES` is `payload_too_large`. `url` is the stable service URL
 * (`<service>/a/<id>`), safe to put in an email: it never expires.
 */
export const Asset = z.object({
  id: Id,
  url: z.string().url(),
  content_type: AssetContentType,
  size_bytes: z.number().int().min(1).max(MAX_ASSET_BYTES),
  width: z.number().int().min(1).nullable(),
  height: z.number().int().min(1).nullable(),
  filename: z.string().min(1).max(255),
  created_at: Timestamp,
});
export type Asset = z.infer<typeof Asset>;

export const ASSET_UPLOAD_FIELD = 'file';

/** The longest address `assets.import` accepts. */
export const MAX_IMPORT_URL_LENGTH = 2048;

/**
 * Copying a remote image into the workspace's assets: the service fetches
 * `url` (`https` only, as for webhooks: a plain `http` fetch can be altered in transit, and a hosted asset is content the service vouches for; never a private, loopback or link-local address,
 * never following a redirect), checks the bytes the way an upload is checked
 * (PNG, JPEG, GIF or WebP, at most `MAX_ASSET_BYTES`) and answers with the new
 * `Asset`, whose `url` is the service's own.
 *
 * Refusals: a blocked address or a redirect is `invalid_request`; a remote 4xx
 * is `invalid_request` with `details.status`; a network failure, a timeout or
 * a remote 5xx is `provider_error` (502, retryable) with `details.service =
 * "asset_import"`; the bytes are `unsupported_media_type` or
 * `payload_too_large` as for an upload.
 */
export const AssetImport = z.object({
  url: z
    .string()
    .max(MAX_IMPORT_URL_LENGTH)
    .url()
    .refine((u) => {
      try {
        const url = new URL(u);
        if (url.protocol === 'https:') return true;
        return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
      } catch {
        return false;
      }
    }, 'must be https (http only for localhost)'),
  /** The stored file name; derived from the address when omitted. */
  filename: z.string().min(1).max(255).optional(),
});
export type AssetImport = z.infer<typeof AssetImport>;

// MJML import and export

/**
 * The largest MJML source `templates.import` and `templates.importPreview`
 * accept, in UTF-8 bytes (the editor core's `MAX_MJML_BYTES`). Larger is
 * `payload_too_large`. The import also refuses nesting deeper than
 * `MAX_MJML_DEPTH` and more than `MAX_MJML_ELEMENTS` elements (`invalid_mjml`).
 */
export const MAX_MJML_IMPORT_BYTES = 512 * 1024;
export const MAX_MJML_DEPTH = 32;
export const MAX_MJML_ELEMENTS = 5000;
/** The most remote images one import copies into the workspace's assets. */
export const MAX_IMPORTED_REMOTE_IMAGES = 50;

/**
 * `details.reason` of an `invalid_mjml` (422) refusal, with `details.line` and
 * `details.column` when the problem is at one place:
 * - `invalid_xml`: not well-formed (an unclosed or mismatched tag, a malformed attribute);
 * - `not_mjml`: no `<mjml>` root or no `<mj-body>`;
 * - `include_not_supported`: `mj-include` needs files, and an import has none;
 * - `too_deep`, `too_many_elements`: over the limits above;
 * - `too_complex`: reading it took longer than the service allows for one document;
 * - `invalid_document`: the import produced a document the editor's schema refuses (a service bug; report it).
 */
export const MJML_IMPORT_REFUSALS = [
  'invalid_xml',
  'not_mjml',
  'include_not_supported',
  'too_deep',
  'too_many_elements',
  'too_complex',
  'invalid_document',
] as const;
export type MjmlImportRefusal = (typeof MJML_IMPORT_REFUSALS)[number];

/**
 * One thing the import could not carry over exactly, or wants the author to
 * know. Nothing is dropped silently.
 * - `info`: the compiled mail is unchanged, the editor shows or edits it
 *   differently (document-wide defaults the canvas does not render, a comment
 *   between columns left out).
 * - `warning`: kept so the mail stays the same, but not as an editable block
 *   (compiled to a Raw HTML block, `fragment` holds the MJML it came from), or
 *   something the source asked for could not be honoured (an unknown
 *   component, a remote image that could not be copied).
 */
export const ImportWarning = z.object({
  severity: z.enum(['info', 'warning']),
  /** Stable kind, e.g. `kept_as_html`, `unknown_component`, `remote_image_not_imported`. */
  code: z.string().min(1).max(64),
  /** Where in the source, e.g. `mj-body > mj-section[2] > mj-column[1] > mj-social[1]`. */
  path: z.string(),
  line: z.number().int().min(1).optional(),
  message: z.string().min(1),
  fragment: z.string().optional(),
});
export type ImportWarning = z.infer<typeof ImportWarning>;

/** An image the imported document loads from outside the service, and where. */
export const RemoteImage = z.object({
  url: z.string().min(1),
  /** The element and attribute it is loaded from, e.g. `<img src>`. */
  where: z.string(),
});
export type RemoteImage = z.infer<typeof RemoteImage>;

/** A remote image the import copied into the workspace's assets, and the address it now has. */
export const ImportedAsset = z.object({
  source_url: z.string().min(1),
  asset_id: Id,
  url: z.string().url(),
});
export type ImportedAsset = z.infer<typeof ImportedAsset>;

const mjmlSource = z.string().min(1, 'paste or upload the MJML');

/** Reading MJML without saving anything: the editor document it becomes, and how it compiles. */
export const TemplateImportPreviewRequest = z.object({ mjml: mjmlSource });
export type TemplateImportPreviewRequest = z.infer<typeof TemplateImportPreviewRequest>;

export const TemplateImportPreview = z.object({
  document: TemplateDocument,
  warnings: z.array(ImportWarning),
  /** The document compiled under the workspace's asset policy, exactly as a send would. */
  compiled: CompileResult,
  /** Images loaded from outside the service; under `service_only` each is also a compile error. */
  remote_images: z.array(RemoteImage),
  asset_policy: z.enum(['any', 'service_only']),
});
export type TemplateImportPreview = z.infer<typeof TemplateImportPreview>;

/**
 * Creating a template (version 1) from MJML. With `import_remote_assets`, every
 * remote `https` image is first copied into the workspace's assets (as
 * `assets.import` does: no private addresses, no redirects, images only, at most
 * `MAX_IMPORTED_REMOTE_IMAGES`) and the document points at the copies; an image
 * that cannot be copied stays remote and is a `remote_image_not_imported`
 * warning. Idempotent with an `Idempotency-Key`: a retry with the same key and
 * body answers with the first result and creates nothing.
 */
export const TemplateImport = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  mjml: mjmlSource,
  import_remote_assets: z.boolean().optional(),
});
export type TemplateImport = z.infer<typeof TemplateImport>;

export const TemplateImportResult = z.object({
  template: Template,
  warnings: z.array(ImportWarning),
  imported_assets: z.array(ImportedAsset),
});
export type TemplateImportResult = z.infer<typeof TemplateImportResult>;

export const EXPORT_FORMATS = ['mjml', 'html'] as const;
export const ExportFormat = z.enum(EXPORT_FORMATS);
export type ExportFormat = z.infer<typeof ExportFormat>;

/** `format` of the file; `version` a past version of the template (the current one when omitted). */
export const TemplateExportQuery = z.object({
  format: ExportFormat,
  version: z.coerce.number().int().min(1).optional(),
});
export type TemplateExportQuery = z.infer<typeof TemplateExportQuery>;

export const MailingExportQuery = z.object({ format: ExportFormat });
export type MailingExportQuery = z.infer<typeof MailingExportQuery>;

/** The content type of an exported file. MJML has no registered media type, so it is plain text. */
export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  mjml: 'text/plain; charset=utf-8',
  html: 'text/html; charset=utf-8',
};

/**
 * An export never refuses a document: what would block a send (an MJML error,
 * an address the workspace's `service_only` asset policy does not allow) is
 * reported in this header instead, as URL-encoded JSON of `CompileMessage[]`,
 * shortened to fit (the full count is in `EXPORT_WARNING_COUNT_HEADER`).
 */
export const EXPORT_WARNINGS_HEADER = 'x-mail-export-warnings';
export const EXPORT_WARNING_COUNT_HEADER = 'x-mail-export-warning-count';
/** The longest `EXPORT_WARNINGS_HEADER` value the service sends. */
export const MAX_EXPORT_WARNINGS_HEADER_LENGTH = 6000;

/** Builds the EXPORT_WARNINGS_HEADER value: as many messages as fit, in order. */
export function formatExportWarningsHeader(messages: readonly CompileMessage[]): string {
  const kept: CompileMessage[] = [];
  for (const m of messages) {
    if (encodeURIComponent(JSON.stringify([...kept, m])).length > MAX_EXPORT_WARNINGS_HEADER_LENGTH) break;
    kept.push(m);
  }
  return encodeURIComponent(JSON.stringify(kept));
}

/** Reads an EXPORT_WARNINGS_HEADER value back; an absent or unreadable value is no warnings. */
export function parseExportWarningsHeader(value: string | null | undefined): CompileMessage[] {
  if (!value) return [];
  try {
    const parsed = z.array(CompileMessage).safeParse(JSON.parse(decodeURIComponent(value)));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

/**
 * The file name of an export: the name reduced to ASCII letters, numbers, `-`
 * and `_` (at most 80 characters), plus the format's extension. Sent as
 * `Content-Disposition: attachment; filename="..."`.
 */
export function exportFilename(name: string, format: ExportFormat): string {
  const stem = name
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${stem || 'export'}.${format}`;
}
