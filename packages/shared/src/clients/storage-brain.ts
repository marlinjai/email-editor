import { StorageBrain } from '@marlinjai/storage-brain-sdk';

export interface StorageBrainConfig {
  apiKey: string;
  baseUrl?: string;
  workspaceId?: string;
}

export function createStorageBrainClient(config: StorageBrainConfig): StorageBrain {
  return new StorageBrain({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    workspaceId: config.workspaceId,
  });
}
