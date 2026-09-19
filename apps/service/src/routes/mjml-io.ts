import {
  MAX_ASSET_BYTES,
  MAX_IMPORTED_REMOTE_IMAGES,
  MAX_MJML_IMPORT_BYTES,
  type ImportWarning,
  type ImportedAsset,
  type TemplateDocument,
} from '@marlinjai/mail-contract';
import { Hono, type Context } from 'hono';
import { ApiError } from '../api-error.js';
import { fetchRemoteImage } from '../assets/remote.js';
import type { AssetStorage } from '../assets/storage.js';
import { absoluteAssetUrls, exportResponse, remoteImages, replaceAddresses } from '../compile/mjml-io.js';
import type { MjmlImporter } from '../compile/pool.js';
import type { WorkspaceCompile } from '../compile/workspace-compile.js';
import { actorLabel, actorOf, type AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { acceptDocument, schemaVersionOf, validateDocument } from '../documents.js';
import { mount, type MountDeps } from '../mount.js';
import { repos } from '../repo/index.js';
import { checkBody, params, query, rawJson, rowId } from '../validate.js';
import type { SsrfPolicy } from '../webhooks/ssrf.js';
import { IMPORT_TIMEOUT_MS, storeImageWith } from './assets.js';

export type MjmlIoDeps = MountDeps & {
  compiler: WorkspaceCompile;
  importer: MjmlImporter;
  storage: AssetStorage;
  /** The SSRF guard remote images are fetched under: the one `assets.import` uses. */
  importPolicy: SsrfPolicy;
  importTimeoutMs?: number;
  publicBaseUrl: string;
  log: Pick<Console, 'error'>;
};

/** How many remote images one import fetches at the same time. */
const IMAGE_CONCURRENCY = 4;

function checkSize(mjml: string): void {
  const bytes = Buffer.byteLength(mjml, 'utf8');
  if (bytes > MAX_MJML_IMPORT_BYTES) {
    throw new ApiError('payload_too_large', `The MJML is ${bytes} bytes; the limit is ${MAX_MJML_IMPORT_BYTES}.`, {
      limit_bytes: MAX_MJML_IMPORT_BYTES,
    });
  }
}

/**
 * MJML import and export (`templates.import`, `templates.importPreview`,
 * `templates.export`, `mailings.export`).
 *
 * - Reading MJML happens in the compile pool's workers, under the same
 *   deadline and queue as a compile, never on the request thread.
 * - The preview saves nothing. The import creates version 1 of a new template
 *   in one transaction, and is safe to retry with an `Idempotency-Key`.
 * - `import_remote_assets` copies every remote image through the same fetch
 *   `assets.import` uses (https only, SSRF-guarded, images only) before the
 *   template is written, and points the document at the copies. An image that
 *   cannot be copied stays remote and becomes a warning, never a failed import.
 * - An export compiles under the workspace's asset policy, like a send, and
 *   never refuses: what would block a send goes in the warnings header.
 */
export function mjmlIoRoutes(sql: Sql, deps: MjmlIoDeps) {
  const app = new Hono<AppEnv>();
  const { pool, compiler, importer, publicBaseUrl } = deps;

  async function readMjml(mjml: string) {
    checkSize(mjml);
    const imported = await importer.importMjml(mjml);
    // The core validated it already; this is the service's own gate for every stored document.
    const document = validateDocument(imported.document);
    return { document, warnings: imported.warnings };
  }

  async function copyRemoteImages(c: Context<AppEnv>, workspaceId: string, document: TemplateDocument) {
    const compiled = await compiler.compile(workspaceId, document);
    const found = remoteImages(compiled.html, publicBaseUrl);
    const warnings: ImportWarning[] = [];
    const imported: ImportedAsset[] = [];
    const replacements = new Map<string, string>();
    const todo = found.slice(0, MAX_IMPORTED_REMOTE_IMAGES);
    for (const skipped of found.slice(MAX_IMPORTED_REMOTE_IMAGES)) {
      warnings.push({
        severity: 'warning',
        code: 'remote_image_not_imported',
        path: skipped.where,
        message: `Not copied: an import copies at most ${MAX_IMPORTED_REMOTE_IMAGES} images. "${skipped.url}" still loads from its own server; upload it and replace it in the editor.`,
      });
    }
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const image = todo[next++]!;
        try {
          const fetched = await fetchRemoteImage(image.url, {
            policy: deps.importPolicy,
            maxBytes: MAX_ASSET_BYTES,
            timeoutMs: deps.importTimeoutMs ?? IMPORT_TIMEOUT_MS,
          });
          const row = await storeImageWith(sql, deps, c, {
            bytes: fetched.bytes,
            name: fetched.finalName ?? undefined,
            declaredType: null,
            action: 'asset.imported',
            auditDetails: { source_url: image.url.length > 500 ? `${image.url.slice(0, 500)}...` : image.url, via: 'templates.import' },
          });
          const url = `${publicBaseUrl}/a/${row.id}`;
          replacements.set(image.url, url);
          imported.push({ source_url: image.url, asset_id: row.id, url });
        } catch (err) {
          const why = err instanceof ApiError ? err.message : 'the image could not be fetched';
          if (!(err instanceof ApiError)) deps.log.error(`[${c.get('requestId')}] templates.import: copying ${image.url} failed:`, err);
          warnings.push({
            severity: 'warning',
            code: 'remote_image_not_imported',
            path: image.where,
            message: `"${image.url}" could not be copied into this workspace's images (${why}). It still loads from its own server.`,
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, todo.length) }, worker));
    // Report in document order, whatever order the fetches finished in.
    const order = new Map(found.map((f, i) => [f.url, i]));
    imported.sort((a, b) => order.get(a.source_url)! - order.get(b.source_url)!);
    return { document: replacements.size > 0 ? replaceAddresses(document, replacements) : document, imported, warnings };
  }

  mount(app, 'templates.importPreview', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const input = checkBody('templates.importPreview', await rawJson(c));
    const { document, warnings } = await readMjml(input.mjml);
    const compiled = await compiler.compile(workspaceId, document);
    const workspace = await pool.workspaces.get(workspaceId);
    if (!workspace) throw new ApiError('not_found', 'The workspace no longer exists.');
    return c.json({
      document,
      warnings,
      compiled,
      remote_images: remoteImages(compiled.html, publicBaseUrl),
      asset_policy: workspace.settings.asset_policy,
    });
  });

  mount(app, 'templates.import', deps, async (c) => {
    const access = c.get('access');
    const input = checkBody('templates.import', await rawJson(c));
    const read = await readMjml(input.mjml);
    let document: TemplateDocument = read.document as unknown as TemplateDocument;
    const warnings: ImportWarning[] = [...read.warnings];
    let importedAssets: ImportedAsset[] = [];
    if (input.import_remote_assets) {
      const copied = await copyRemoteImages(c, access.workspaceId, document);
      document = copied.document;
      importedAssets = copied.imported;
      warnings.push(...copied.warnings);
    }
    const stored = acceptDocument(document);
    const template = await sql.begin(async (tx) => {
      const r = repos(tx);
      const created = await r.templates.create(access.workspaceId, {
        name: input.name,
        description: input.description ?? null,
        document: stored as unknown as Record<string, unknown>,
        schemaVersion: schemaVersionOf(stored),
        createdBy: actorLabel(access),
      });
      await r.audit.record(access.workspaceId, {
        action: 'template.created',
        actor: actorOf(access),
        targetType: 'template',
        targetId: created.id,
        details: {
          name: created.name,
          version: created.version,
          source: 'mjml_import',
          warnings: warnings.length,
          imported_assets: importedAssets.length,
        },
      });
      return created;
    });
    return c.json({ template, warnings, imported_assets: importedAssets }, 201);
  });

  mount(app, 'templates.export', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'templates.export').id, 'template');
    const q = query(c, 'templates.export');
    const template = await pool.templates.get(workspaceId, id);
    if (!template) throw new ApiError('not_found', 'No such template in this workspace.');
    let stored = template.document;
    let name = template.name;
    if (q.version !== undefined && q.version !== template.version) {
      const version = await pool.templates.version(workspaceId, id, q.version);
      if (!version) throw new ApiError('not_found', `This template has no version ${q.version}.`);
      stored = version.document;
      name = `${template.name}-v${q.version}`;
    }
    const document = absoluteAssetUrls(validateDocument(stored), publicBaseUrl);
    return exportResponse(await compiler.compile(workspaceId, document), q.format, name);
  });

  mount(app, 'mailings.export', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const id = rowId(params(c, 'mailings.export').id, 'mailing');
    const q = query(c, 'mailings.export');
    const mailing = await pool.mailings.get(workspaceId, id);
    if (!mailing) throw new ApiError('not_found', 'No such mailing in this workspace.');
    const document = absoluteAssetUrls(validateDocument(mailing.document), publicBaseUrl);
    return exportResponse(await compiler.compile(workspaceId, document), q.format, mailing.name ?? mailing.subject);
  });

  return app;
}
