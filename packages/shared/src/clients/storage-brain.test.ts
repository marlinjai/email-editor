import { describe, it, expect, vi } from 'vitest';
import { createStorageBrainClient, type StorageBrainConfig } from './storage-brain';

vi.mock('@marlinjai/storage-brain-sdk', () => {
  return {
    StorageBrain: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
      _config: config,
    })),
  };
});

describe('createStorageBrainClient', () => {
  it('creates a client with required config', () => {
    const config: StorageBrainConfig = {
      apiKey: 'test-key',
    };
    const client = createStorageBrainClient(config) as unknown as { _config: Record<string, unknown> };
    expect(client._config.apiKey).toBe('test-key');
    expect(client._config.baseUrl).toBeUndefined();
    expect(client._config.workspaceId).toBeUndefined();
  });

  it('passes baseUrl and workspaceId when provided', () => {
    const config: StorageBrainConfig = {
      apiKey: 'test-key',
      baseUrl: 'https://storage.example.com',
      workspaceId: 'ws-456',
    };
    const client = createStorageBrainClient(config) as unknown as { _config: Record<string, unknown> };
    expect(client._config.baseUrl).toBe('https://storage.example.com');
    expect(client._config.workspaceId).toBe('ws-456');
  });
});
