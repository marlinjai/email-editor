import { describe, it, expect, vi } from 'vitest';
import { createDataBrainClient, type DataBrainConfig } from './data-brain';

vi.mock('@marlinjai/data-brain-sdk', () => {
  return {
    DataBrain: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
      _config: config,
    })),
  };
});

describe('createDataBrainClient', () => {
  it('creates a client with required config', () => {
    const config: DataBrainConfig = {
      baseUrl: 'https://example.com',
      apiKey: 'test-key',
    };
    const client = createDataBrainClient(config) as unknown as { _config: Record<string, unknown> };
    expect(client._config.baseUrl).toBe('https://example.com');
    expect(client._config.apiKey).toBe('test-key');
    expect(client._config.workspaceId).toBeUndefined();
  });

  it('passes workspaceId when provided', () => {
    const config: DataBrainConfig = {
      baseUrl: 'https://example.com',
      apiKey: 'test-key',
      workspaceId: 'ws-123',
    };
    const client = createDataBrainClient(config) as unknown as { _config: Record<string, unknown> };
    expect(client._config.workspaceId).toBe('ws-123');
  });
});
