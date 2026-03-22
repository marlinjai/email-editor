// Client factories
export { createStorageBrainClient, type StorageBrainConfig } from './clients/storage-brain';

// Context providers
export { WorkspaceProvider, useWorkspace, type WorkspaceProviderProps } from './context/workspace';
export { AuthProvider, useAuth, type AuthProviderProps } from './context/auth';
export {
  PlatformProvider,
  usePlatform,
  useDatabaseAdapter,
  useStorageBrain,
  type PlatformProviderProps,
} from './context/platform';

// Hooks
export { usePaginatedQuery } from './hooks/use-paginated-query';

// Schema
export { bootstrapTables, type TableDefinition } from './schema/bootstrapper';

// Types
export type { PaginatedResult, User, WorkspaceRole } from './types';
