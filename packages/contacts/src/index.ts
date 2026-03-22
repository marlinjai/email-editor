// Types
export type {
  Contact,
  ContactStatus,
  ContactListOptions,
  ContactStorageAdapter,
  CreateContactInput,
  UpdateContactInput,
  Segment,
  SegmentRule,
  SegmentOperator,
  SegmentGroup,
  Unsubscribe,
  CSVFieldMapping,
  CSVImportResult,
} from './types';

// Adapter
export { DatabaseContactAdapter } from './adapter';
export type { DatabaseContactAdapterConfig } from './adapter';

// CSV Importer
export {
  parseCSV,
  detectDelimiter,
  detectColumns,
  suggestMappings,
  importCSV,
} from './csv-importer';

// Merge Fields
export {
  resolveMergeFields,
  extractMergeFields,
  BUILT_IN_MERGE_FIELDS,
} from './merge-fields';

// Segment Evaluator
export {
  evaluateRule,
  evaluateRules,
  evaluateSegmentGroup,
} from './segment-evaluator';

// Unsubscribe
export {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateUnsubscribeUrl,
  processUnsubscribe,
  canReceiveEmail,
  generateListUnsubscribeHeaders,
} from './unsubscribe';
export type { UnsubscribeConfig } from './unsubscribe';

// Workspace-scoped manager
export { WorkspaceScopedContactManager } from './workspace-scoped';
export type { WorkspaceScopedContactConfig } from './workspace-scoped';

// Schema
export { CONTACT_TABLES } from './schema';
