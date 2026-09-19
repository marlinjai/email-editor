// packages/core/src/importer/index.ts
// MJML import (server only: exported from `@marlinjai/email-editor-core/server`)

export { importMjml } from './importMjml';
export {
  MAX_MJML_BYTES,
  MAX_MJML_DEPTH,
  MAX_MJML_ELEMENTS,
  MjmlImportError,
  isMjmlImportError,
  type MjmlImportErrorCode,
  type MjmlImportResult,
  type MjmlImportWarning,
  type MjmlImportWarningCode,
  type MjmlImportWarningSeverity,
} from './types';
