import { DataBrain } from '@marlinjai/data-brain-sdk';

export interface DataBrainConfig {
  baseUrl: string;
  apiKey: string;
  workspaceId?: string;
}

export function createDataBrainClient(config: DataBrainConfig): DataBrain {
  return new DataBrain({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    workspaceId: config.workspaceId,
  });
}
