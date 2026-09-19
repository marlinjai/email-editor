'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { MailApiError, MAX_IMPORT_BYTES, Slug, type ImportJob, type ImportRow, type ImportRowOutcome, type Page } from '@marlinjai/mail-sdk';
import { act, DashboardRefusal, parseInput } from '@/lib/action';
import { mail, mailForUpload } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

/*
 * CSV import, as the service runs it: upload, map (which starts a dry run),
 * commit exactly the dry run that was shown, or cancel. Every step answers
 * with the import as it now stands; the screen renders from that and from
 * nothing kept in the browser, so a reload always resumes where it is.
 */

const importsPath = (ws: string) => `/w/${ws}/contacts/imports`;

export async function uploadImport(ws: string, form: FormData): Promise<ActionResult<{ id: string }>> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: { code: 'validation_failed', message: 'Choose a CSV file to upload.', fields: { file: 'Choose a CSV file' } } };
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, error: { code: 'payload_too_large', message: `The file is ${Math.ceil(file.size / 1024 / 1024)} MB; an import takes at most 50 MB. Split it into smaller files.` } };
  }
  return act('imports.create', async () => {
    const { api } = await mailForUpload(ws);
    const job = await api.imports.create(file, file.name);
    revalidatePath(importsPath(ws));
    return { id: job.id };
  });
}

export async function getImport(ws: string, id: string): Promise<ActionResult<ImportJob>> {
  return act('imports.get', async () => (await mail(ws)).api.imports.get(id));
}

const MappingInput = z.object({
  mapping: z.record(z.string()),
  topics: z.array(Slug),
  tags: z.array(Slug),
  updateExisting: z.boolean(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Confirm that these people agreed to hear from you' }) }),
});

export async function setImportMapping(ws: string, id: string, input: z.input<typeof MappingInput>): Promise<ActionResult<ImportJob>> {
  const parsed = parseInput(MappingInput, input);
  if (!parsed.ok) return parsed;
  const m = parsed.data;
  const emails = Object.values(m.mapping).filter((v) => v === 'email').length;
  if (emails !== 1) {
    return {
      ok: false,
      error: { code: 'validation_failed', message: emails === 0 ? 'Choose the column that holds the email address.' : 'Only one column can be the email address.', fields: { mapping: 'exactly one email column' } },
    };
  }
  return act('imports.setMapping', async () => {
    const { api } = await mail(ws);
    const job = await api.imports.setMapping(id, {
      mapping: m.mapping,
      topics: m.topics,
      tags: m.tags,
      update_existing: m.updateExisting,
      consent_confirmed: true,
    });
    revalidatePath(`${importsPath(ws)}/${id}`);
    return job;
  });
}

/**
 * Commits the dry run of `mappingVersion`, the one on screen. If the mapping
 * moved on in the meantime (another tab, another person) the service refuses
 * with `conflict`; the screen then shows the newer dry run to review instead.
 */
export async function commitImport(ws: string, id: string, mappingVersion: number): Promise<ActionResult<ImportJob>> {
  return act('imports.commit', async () => {
    const { api } = await mail(ws);
    try {
      const job = await api.imports.commit(id, { mapping_version: mappingVersion });
      revalidatePath(`${importsPath(ws)}/${id}`);
      revalidatePath(importsPath(ws));
      return job;
    } catch (err) {
      if (err instanceof MailApiError && err.code === 'conflict') {
        revalidatePath(`${importsPath(ws)}/${id}`);
        throw new DashboardRefusal('conflict', `Nothing was imported. ${err.message}`, undefined, err.details);
      }
      throw err;
    }
  });
}

export async function cancelImport(ws: string, id: string): Promise<ActionResult<ImportJob>> {
  return act('imports.cancel', async () => {
    const { api } = await mail(ws);
    try {
      const job = await api.imports.cancel(id);
      revalidatePath(`${importsPath(ws)}/${id}`);
      revalidatePath(importsPath(ws));
      return job;
    } catch (err) {
      // Finished in the meantime: nothing to cancel, and the page shows how it ended.
      if (err instanceof MailApiError && err.code === 'conflict') throw new DashboardRefusal('conflict', `${err.message} Reload to see how it ended.`, undefined, err.details);
      throw err;
    }
  });
}

export async function importRows(ws: string, id: string, outcome: ImportRowOutcome | null, cursor: string | null): Promise<ActionResult<Page<ImportRow>>> {
  return act('imports.rows', async () => (await mail(ws)).api.imports.rows(id, { limit: 50, ...(outcome ? { outcome } : {}), ...(cursor ? { cursor } : {}) }));
}
