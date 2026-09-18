import type { AssetContentType, AuditActor } from '@marlinjai/mail-contract';
import type { Db } from '../db.js';

export type AssetRow = {
  id: string;
  content_type: AssetContentType;
  size_bytes: number;
  width: number | null;
  height: number | null;
  filename: string;
  created_at: string;
};

/** What the public URL needs to serve the bytes. */
export type AssetBlob = {
  id: string;
  storage_file_id: string;
  content_type: AssetContentType;
  size_bytes: number;
  sha256: string;
};

const COLUMNS = 'id, content_type, size_bytes, width, height, filename, created_at';

export function assetsRepo(db: Db) {
  return {
    async create(
      workspaceId: string,
      input: {
        id: string;
        storageFileId: string;
        contentType: AssetContentType;
        sizeBytes: number;
        width: number | null;
        height: number | null;
        filename: string;
        sha256: string;
        createdBy: AuditActor;
      },
    ): Promise<AssetRow> {
      const rows = await db<AssetRow[]>`
        INSERT INTO assets (id, workspace_id, storage_file_id, content_type, size_bytes, width, height, filename, sha256, created_by)
        VALUES (${input.id}, ${workspaceId}, ${input.storageFileId}, ${input.contentType}, ${input.sizeBytes},
                ${input.width}, ${input.height}, ${input.filename}, ${input.sha256}, ${db.json(input.createdBy)})
        RETURNING ${db.unsafe(COLUMNS)}`;
      return rows[0]!;
    },

    async get(workspaceId: string, assetId: string): Promise<AssetRow | null> {
      const rows = await db<AssetRow[]>`
        SELECT ${db.unsafe(COLUMNS)} FROM assets WHERE workspace_id = ${workspaceId} AND id = ${assetId}`;
      return rows[0] ?? null;
    },

    /**
     * The one asset lookup without a workspace: the public URL `/a/:id` that an
     * email client fetches with no credentials. The id is a random UUID, which
     * is what makes the URL unguessable, and it returns only what serving the
     * bytes needs, never the owning workspace.
     */
    async blobForPublicUrl(assetId: string): Promise<AssetBlob | null> {
      const rows = await db<AssetBlob[]>`
        SELECT id, storage_file_id, content_type, size_bytes, sha256 FROM assets WHERE id = ${assetId}`;
      return rows[0] ?? null;
    },
  };
}
