'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ASSET_CONTENT_TYPES,
  MAX_ASSET_BYTES,
  MailApiError,
  TemplateDocument,
  type Asset,
  type CompileResult,
  type Template,
} from '@marlinjai/mail-sdk';
import { act, DashboardRefusal, parseInput } from '@/lib/action';
import { blankDocument } from '@/lib/documents';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

const templatesPath = (ws: string) => `/w/${ws}/templates`;

const CreateInput = z.object({ name: z.string().trim().min(1, 'Name the template').max(200), description: z.string().max(2000) });

export async function createTemplate(ws: string, input: z.input<typeof CreateInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(CreateInput, input);
  if (!parsed.ok) return parsed;
  return act('templates.create', async () => {
    const { api } = await mail(ws);
    const created = await api.templates.create({
      name: parsed.data.name,
      description: parsed.data.description.trim() || undefined,
      document: blankDocument(parsed.data.name),
    });
    revalidatePath(templatesPath(ws));
    return { id: created.id };
  });
}

export async function duplicateTemplate(ws: string, templateId: string): Promise<ActionResult<{ id: string }>> {
  return act('templates.duplicate', async () => {
    const { api } = await mail(ws);
    const source = await api.templates.get(templateId);
    const copy = await api.templates.create({
      name: `${source.name} (copy)`.slice(0, 200),
      description: source.description ?? undefined,
      document: source.document,
    });
    revalidatePath(templatesPath(ws));
    return { id: copy.id };
  });
}

/**
 * The outcome of a save. A `conflict` is not an error to the editor: it means
 * someone saved in the meantime, and the person decides whether to take their
 * version or to save theirs on top.
 */
export type SaveOutcome = { kind: 'saved'; template: Template } | { kind: 'conflict'; currentVersion: number | null };

const SaveInput = z.object({
  baseVersion: z.number().int().min(1),
  name: z.string().trim().min(1, 'Name the template').max(200).optional(),
  document: TemplateDocument.optional(),
});

export async function saveTemplate(ws: string, templateId: string, input: z.input<typeof SaveInput>): Promise<ActionResult<SaveOutcome>> {
  const parsed = parseInput(SaveInput, input);
  if (!parsed.ok) return parsed;
  return act('templates.update', async () => {
    const { api } = await mail(ws);
    try {
      const template = await api.templates.update(templateId, {
        base_version: parsed.data.baseVersion,
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.document !== undefined ? { document: parsed.data.document } : {}),
      });
      revalidatePath(templatesPath(ws));
      return { kind: 'saved', template } satisfies SaveOutcome;
    } catch (err) {
      if (err instanceof MailApiError && err.code === 'conflict') {
        const current = err.details?.current_version;
        return { kind: 'conflict', currentVersion: typeof current === 'number' ? current : null } satisfies SaveOutcome;
      }
      throw err;
    }
  });
}

export async function reloadTemplate(ws: string, templateId: string): Promise<ActionResult<Template>> {
  return act('templates.get', async () => (await mail(ws)).api.templates.get(templateId));
}

export async function setArchived(ws: string, templateId: string, baseVersion: number, archived: boolean): Promise<ActionResult> {
  return act('templates.archive', async () => {
    const { api } = await mail(ws);
    await api.templates.update(templateId, { base_version: baseVersion, archived });
    revalidatePath(templatesPath(ws));
    return null;
  });
}

export async function deleteTemplate(ws: string, templateId: string): Promise<ActionResult> {
  return act('templates.delete', async () => {
    const { api } = await mail(ws);
    await api.templates.delete(templateId);
    revalidatePath(templatesPath(ws));
    return null;
  });
}

/** Compiles the unsaved document the editor holds, for the preview. */
export async function compileDocument(ws: string, document: unknown): Promise<ActionResult<CompileResult>> {
  const parsed = parseInput(TemplateDocument, document);
  if (!parsed.ok) return parsed;
  return act('compile', async () => (await mail(ws)).api.compile({ document: parsed.data }));
}

/** Compiles a saved version, for the history preview. */
export async function compileVersion(ws: string, templateId: string, version: number): Promise<ActionResult<CompileResult>> {
  return act('templates.compile', async () => (await mail(ws)).api.templates.compile(templateId, { version }));
}

/**
 * Restoring is a save of the old version's document on the current version, so
 * history only ever grows (the service's S1 default).
 */
export async function restoreVersion(
  ws: string,
  templateId: string,
  version: number,
  baseVersion: number,
): Promise<ActionResult<SaveOutcome>> {
  return act('templates.restore', async () => {
    const { api } = await mail(ws);
    const old = await api.templates.version(templateId, version);
    try {
      const template = await api.templates.update(templateId, { base_version: baseVersion, document: old.document });
      revalidatePath(`${templatesPath(ws)}/${templateId}`, 'layout');
      return { kind: 'saved', template } satisfies SaveOutcome;
    } catch (err) {
      if (err instanceof MailApiError && err.code === 'conflict') {
        const current = err.details?.current_version;
        return { kind: 'conflict', currentVersion: typeof current === 'number' ? current : null } satisfies SaveOutcome;
      }
      throw err;
    }
  });
}

/**
 * The editor's image upload (its `onRequestImage` hook): the file goes from the
 * browser to this action and on to the mail service's assets API, which stores
 * it and answers with a stable URL that is safe to put in an email.
 */
export async function uploadImage(ws: string, form: FormData): Promise<ActionResult<Asset>> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: { code: 'validation_failed', message: 'Choose an image to upload.' } };
  }
  return act('assets.upload', async () => {
    if (file.size > MAX_ASSET_BYTES)
      throw new DashboardRefusal('payload_too_large', `Images can be at most ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`);
    if (file.type && !(ASSET_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      throw new DashboardRefusal('unsupported_media_type', 'Only PNG, JPEG, GIF and WebP images can be uploaded.');
    }
    const { api } = await mail(ws);
    return api.assets.upload(file, file.name);
  });
}

/**
 * Copies a remote image into the workspace's assets (the service's
 * `assets.import`), so a workspace that allows only service-hosted images can
 * send the mail: the editor then swaps the old address for the asset's.
 */
export async function importAsset(ws: string, url: string): Promise<ActionResult<Asset>> {
  return act('assets.import', async () => (await mail(ws)).api.assets.import({ url }));
}
