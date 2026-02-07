// packages/core/src/server.ts
// SERVER-SIDE ONLY exports
// Import this in Node.js/server environments only

export * from './compiler';
export * from './api';

// MST MJML Exporter (server-side only due to mjml dependency)
export {
  MJMLExporter,
  createMJMLExporter,
  exportTemplate,
  type ExportResult,
  type ExportOptions,
} from './store/mst/MJMLExporter';

