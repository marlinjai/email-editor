import { randomUUID } from 'node:crypto';
import type { AssetStorage } from '../../src/assets/storage.js';
import { AssetStorageUnavailable } from '../../src/assets/storage.js';

/**
 * An in-memory stand-in for Storage Brain, so the integration suite exercises
 * every asset path without a network or a key. `failNext` makes the next call
 * fail the way an unreachable store does.
 */
export class MemoryAssetStorage implements AssetStorage {
  readonly files = new Map<string, { bytes: Buffer; contentType: string; filename: string; workspaceId: string }>();
  failNext: 'put' | 'open' | null = null;
  opens = 0;

  async put(input: Parameters<AssetStorage['put']>[0]): Promise<{ fileId: string }> {
    if (this.failNext === 'put') {
      this.failNext = null;
      throw new AssetStorageUnavailable('memory store: put refused');
    }
    const fileId = `mem_${randomUUID()}`;
    this.files.set(fileId, { bytes: input.bytes, contentType: input.contentType, filename: input.filename, workspaceId: input.workspaceId });
    return { fileId };
  }

  async open(fileId: string): Promise<ReadableStream<Uint8Array> | null> {
    this.opens += 1;
    if (this.failNext === 'open') {
      this.failNext = null;
      throw new AssetStorageUnavailable('memory store: open refused');
    }
    const file = this.files.get(fileId);
    if (!file) return null;
    return new Blob([file.bytes]).stream();
  }

  async remove(fileId: string): Promise<void> {
    this.files.delete(fileId);
  }
}
