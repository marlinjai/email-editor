import { z } from 'zod';
import { Id, PageQuery, Timestamp } from './common';

/*
 * S1, editor and templates: template documents and their versions, compilation,
 * and uploaded assets.
 */

export const DOCUMENT_SCHEMA_VERSIONS = ['1.0'] as const;
export const DocumentSchemaVersion = z.enum(DOCUMENT_SCHEMA_VERSIONS);
export type DocumentSchemaVersion = z.infer<typeof DocumentSchemaVersion>;

/**
 * The editor's template document (`EmailTemplate` in
 * `@marlinjai/email-editor-core`). The contract checks only the envelope, the
 * schema version, and that `sections` is a list; the editor core owns the full
 * block schema and the service validates a document with it before compiling.
 * Importing the core here would pull the MJML compiler into an edge-safe package.
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
