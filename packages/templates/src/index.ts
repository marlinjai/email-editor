// Types
export type {
  Template,
  TemplateVersion,
  TemplateStatus,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListOptions,
} from './types';

// Adapter interface
export type { TemplateStorageAdapter } from './adapter';

// Database adapter implementation
export { DatabaseTemplateAdapter } from './database-adapter';

// Manager
export { TemplateManager } from './manager';
export type { TemplateManagerConfig } from './manager';

// Schema & bootstrap
export { TEMPLATE_TABLES, bootstrapTemplateTables } from './schema';
export type { TableColumnDef, TableSchemaDef } from './schema';

// Workspace-scoped manager
export { WorkspaceScopedTemplateManager } from './workspace-scoped';
export type { WorkspaceScopedConfig } from './workspace-scoped';

// React components
export {
  TemplateDashboard,
  TemplateCard,
  TemplateVersionHistory,
  CreateTemplateDialog,
} from './components';
export type {
  TemplateDashboardProps,
  TemplateCardProps,
  TemplateVersionHistoryProps,
  CreateTemplateDialogProps,
} from './components';
