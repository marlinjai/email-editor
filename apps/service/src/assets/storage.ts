import { StorageBrain } from '@marlinjai/storage-brain-sdk';
import type { AssetContentType } from '@marlinjai/mail-contract';

/**
 * Where asset bytes live. The service keeps its own row per asset (which
 * workspace owns it, the sniffed type, the size) and hands the bytes to this
 * store; the public URL `/a/:id` reads them back through it.
 *
 * Behind an interface so the integration suite runs against an in-memory store
 * and never needs a Storage Brain key.
 */
export interface AssetStorage {
  put(input: {
    workspaceId: string;
    assetId: string;
    bytes: Buffer;
    contentType: AssetContentType;
    filename: string;
  }): Promise<{ fileId: string }>;
  /**
   * The stored bytes as a stream, or null if the store no longer has the file.
   * Any other failure throws.
   */
  open(fileId: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Removes a stored file. Used to undo an upload whose row could not be written. */
  remove(fileId: string): Promise<void>;
}

/** The store could not be reached or refused the request; the request may be retried. */
export class AssetStorageUnavailable extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AssetStorageUnavailable';
  }
}

/** How long the signed URL used for one read is valid. It never leaves the service. */
const SIGNED_URL_TTL_SECONDS = 300;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Storage Brain (`@marlinjai/storage-brain-sdk`), one tenant for the mail
 * service. Files are labelled with the owning workspace (`context`
 * `mail/<workspace id>` and tags), so they can be found per workspace from the
 * Storage Brain side too.
 *
 * Reading mints a short-lived signed URL for every request and fetches it
 * server-side: a signed URL expires, so it is never what a mail links to.
 */
export class StorageBrainAssetStorage implements AssetStorage {
  private readonly client: StorageBrain;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.client = new StorageBrain({ apiKey: options.apiKey, baseUrl: options.baseUrl, timeout: FETCH_TIMEOUT_MS });
  }

  async put(input: Parameters<AssetStorage['put']>[0]): Promise<{ fileId: string }> {
    const file = new File([input.bytes], input.filename, { type: input.contentType });
    try {
      const info = await this.client.upload(file, {
        context: `mail/${input.workspaceId}`,
        tags: { service: 'lumitra-mail', workspace: input.workspaceId, asset: input.assetId },
      });
      return { fileId: info.id };
    } catch (err) {
      throw new AssetStorageUnavailable(`Storage Brain refused the upload: ${describe(err)}`, { cause: err });
    }
  }

  async open(fileId: string): Promise<ReadableStream<Uint8Array> | null> {
    let url: string;
    try {
      url = (await this.client.getSignedUrl(fileId, SIGNED_URL_TTL_SECONDS)).url;
    } catch (err) {
      if (statusOf(err) === 404) return null;
      throw new AssetStorageUnavailable(`Storage Brain did not sign a download URL: ${describe(err)}`, { cause: err });
    }
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      throw new AssetStorageUnavailable(`Storage Brain download failed: ${describe(err)}`, { cause: err });
    }
    if (res.status === 404) return null;
    if (!res.ok || !res.body) {
      throw new AssetStorageUnavailable(`Storage Brain download answered ${res.status}`);
    }
    return res.body;
  }

  async remove(fileId: string): Promise<void> {
    try {
      await this.client.deleteFile(fileId);
    } catch (err) {
      if (statusOf(err) === 404) return;
      throw new AssetStorageUnavailable(`Storage Brain did not delete the file: ${describe(err)}`, { cause: err });
    }
  }
}

function statusOf(err: unknown): number | undefined {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' ? status : undefined;
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}
