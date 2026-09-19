// packages/core/src/server.ts
// SERVER-SIDE ONLY exports
// Import this in Node.js/server environments only

export * from './compiler';

// MST MJML Exporter (server-side only due to mjml dependency)
export {
  MJMLExporter,
  createMJMLExporter,
  exportTemplate,
  type ExportResult,
  type ExportOptions,
} from './store/mst/MJMLExporter';


// MJML import (server-side only: it parses with mjml-parser-xml and compiles fallbacks with mjml)
export * from './importer';
