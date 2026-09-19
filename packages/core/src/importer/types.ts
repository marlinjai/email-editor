// packages/core/src/importer/types.ts
// Result, warning and error types of the MJML import

import type { EmailTemplate } from '../schema/types';

/** The largest MJML source `importMjml` reads, in UTF-8 bytes. */
export const MAX_MJML_BYTES = 512 * 1024;
/** The deepest nesting of MJML elements it reads (`<mjml>` is depth 1). */
export const MAX_MJML_DEPTH = 32;
/** The most MJML elements (outside content such as an `mj-text`'s HTML) it reads. */
export const MAX_MJML_ELEMENTS = 5000;

export type MjmlImportWarningSeverity = 'info' | 'warning';

/**
 * Something the import could not carry over exactly, or wants the author to
 * know. Nothing is dropped silently: every change from the source is one of
 * these, with where it happened.
 *
 * - `info`: the compiled mail is unchanged, but the editor shows or edits it
 *   differently (a document-wide default the canvas does not render, a
 *   comment left out of the structure).
 * - `warning`: the construct is kept so the compiled mail stays faithful, but
 *   not as an editable block (compiled to a Raw HTML block), or something the
 *   source asked for could not be honoured at all (an unknown component).
 */
export interface MjmlImportWarning {
  severity: MjmlImportWarningSeverity;
  /** A stable identifier of the kind of warning, e.g. `kept_as_html`. */
  code: MjmlImportWarningCode;
  /** Where in the source, e.g. `mj-body > mj-section[2] > mj-column[1] > mj-social[1]`. */
  path: string;
  /** 1-based line of the element in the source, when known. */
  line?: number;
  message: string;
  /** The MJML the warning is about, shortened to at most 2000 characters. */
  fragment?: string;
}

export type MjmlImportWarningCode =
  /** Kept as compiled HTML in a Raw block: renders as before, not editable as a block. */
  | 'kept_as_html'
  /** A component MJML itself does not know: it renders nothing, its source is kept in a Raw block. */
  | 'unknown_component'
  /** Document-wide defaults (`mj-attributes`, `mj-class`) apply to the mail but not to the editor canvas. */
  | 'document_defaults'
  /** An attribute the editor has no control for, kept and emitted again. */
  | 'attribute_kept'
  /** An attribute name MJML does not accept either; left out (MJML ignored it too). */
  | 'attribute_dropped'
  /** A comment between columns, left out (comments render nothing). */
  | 'comment_dropped'
  /** Text outside any content element, which MJML ignores. */
  | 'stray_text'
  /** A head element the editor has no field for, kept verbatim. */
  | 'head_element_kept'
  /** A column width in pixels: kept, but the editor's width controls work in percent. */
  | 'column_width_px';

export interface MjmlImportResult {
  /** A valid `1.0` document (it passed `migrateTemplate`). */
  document: EmailTemplate;
  warnings: MjmlImportWarning[];
}

export type MjmlImportErrorCode =
  /** Not well-formed: an unclosed or mismatched tag, a malformed attribute, stray markup. */
  | 'invalid_xml'
  /** Well-formed, but not an MJML document (no `<mjml>` root, no `<mj-body>`). */
  | 'not_mjml'
  /** `mj-include` needs files next to the source; an import has none. */
  | 'include_not_supported'
  /** Larger than {@link MAX_MJML_BYTES}. */
  | 'too_large'
  /** Nested deeper than {@link MAX_MJML_DEPTH}. */
  | 'too_deep'
  /** More than {@link MAX_MJML_ELEMENTS} elements. */
  | 'too_many_elements'
  /** The mapped document failed the schema (a bug in the import, reported rather than hidden). */
  | 'invalid_document';

/** Why an MJML source cannot be imported at all, with where, when it is one place. */
export class MjmlImportError extends Error {
  readonly code: MjmlImportErrorCode;
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(code: MjmlImportErrorCode, message: string, position: { line?: number; column?: number } = {}) {
    super(position.line !== undefined ? `Line ${position.line}${position.column !== undefined ? `, column ${position.column}` : ''}: ${message}` : message);
    this.name = 'MjmlImportError';
    this.code = code;
    this.line = position.line;
    this.column = position.column;
  }

  /** A plain object that survives a worker thread boundary. */
  toJSON(): { code: MjmlImportErrorCode; message: string; line?: number; column?: number } {
    return { code: this.code, message: this.message, line: this.line, column: this.column };
  }
}

export function isMjmlImportError(error: unknown): error is MjmlImportError {
  return error instanceof MjmlImportError;
}
