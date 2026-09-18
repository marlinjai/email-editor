'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  Email,
  MAX_RECIPIENTS_PER_BATCH,
  missingRequiredMergeFields,
  Slug,
  type CompileResult,
  type Mailing,
  type MailingTestResult,
  type MessageSummary,
  type RecipientBatchResult,
  type ResponseMeta,
  type UsageWarningHeaderEntry,
} from '@marlinjai/mail-sdk';
import { act, parseInput } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

/*
 * The mailing flow: compose from a template, add recipients, test, send, then
 * watch, pause, resume, cancel, retry or duplicate. Which of these a mailing
 * allows comes from the contract's MAILING_TRANSITIONS; the service refuses
 * anything else with `mailing_invalid_state`, which the screen shows as is.
 */

const mailingsPath = (ws: string) => `/w/${ws}/mailings`;

const ContentInput = z.object({
  name: z.string().trim().max(200),
  subject: z.string().trim().min(1, 'Every mailing needs a subject').max(998),
  preheader: z.string().trim().max(500),
  topic: Slug,
  providerId: z.string().min(1, 'Choose the provider it is sent through'),
});

const CreateInput = ContentInput.extend({ templateId: z.string().min(1, 'Choose the template to start from') });

export async function createMailing(ws: string, input: z.input<typeof CreateInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(CreateInput, input);
  if (!parsed.ok) return parsed;
  const m = parsed.data;
  return act('mailings.create', async () => {
    const { api, viewer } = await mail(ws);
    const created = await api.mailings.create({
      template_id: m.templateId,
      name: m.name || undefined,
      subject: m.subject,
      preheader: m.preheader || undefined,
      topic: m.topic,
      provider_id: m.providerId,
      // Who composed it, echoed in every message webhook.
      metadata: { created_by: viewer.email, source: 'dashboard' },
    });
    revalidatePath(mailingsPath(ws));
    return { id: created.id };
  });
}

export async function updateMailing(ws: string, id: string, input: z.input<typeof ContentInput>): Promise<ActionResult<Mailing>> {
  const parsed = parseInput(ContentInput, input);
  if (!parsed.ok) return parsed;
  const m = parsed.data;
  return act('mailings.update', async () => {
    const { api } = await mail(ws);
    const updated = await api.mailings.update(id, {
      name: m.name || null,
      subject: m.subject,
      preheader: m.preheader || null,
      topic: m.topic,
      provider_id: m.providerId,
    });
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    return updated;
  });
}

/**
 * Takes the template's current version as the mailing's content again. The
 * mailing otherwise keeps the snapshot it was created with, so editing a
 * template never changes a mailing behind anyone's back.
 */
export async function refreshFromTemplate(ws: string, id: string, templateId: string): Promise<ActionResult<Mailing>> {
  return act('mailings.refreshContent', async () => {
    const { api } = await mail(ws);
    const template = await api.templates.get(templateId);
    const updated = await api.mailings.update(id, { document: template.document });
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    return updated;
  });
}

export async function getMailing(ws: string, id: string): Promise<ActionResult<Mailing>> {
  return act('mailings.get', async () => (await mail(ws)).api.mailings.get(id));
}

export async function compileMailing(ws: string, id: string): Promise<ActionResult<CompileResult>> {
  return act('mailings.compile', async () => {
    const { api } = await mail(ws);
    const mailing = await api.mailings.get(id);
    return api.compile({ document: mailing.document });
  });
}

const RecipientsInput = z
  .array(z.object({ email: Email, firstName: z.string().max(200).nullable() }))
  .min(1, 'Add at least one address')
  .max(MAX_RECIPIENTS_PER_BATCH, `At most ${MAX_RECIPIENTS_PER_BATCH} addresses at a time`);

/**
 * Adds one batch. Idempotent on the address within the mailing, so re-adding a
 * list after a failure only adds what is missing (`already_present` counts the
 * rest). The first name travels as the `first_name` merge value.
 */
export async function addRecipients(
  ws: string,
  id: string,
  input: z.input<typeof RecipientsInput>,
): Promise<ActionResult<RecipientBatchResult & { emails: string[] }>> {
  const parsed = parseInput(RecipientsInput, input);
  if (!parsed.ok) return parsed;
  return act('mailings.addRecipients', async () => {
    const { api } = await mail(ws);
    const result = await api.mailings.addRecipients(id, {
      recipients: parsed.data.map((r) => ({ email: r.email, merge: r.firstName ? { first_name: r.firstName } : ({} as Record<string, string>) })),
    });
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    return { ...result, emails: parsed.data.map((r) => r.email) };
  });
}

const TestInput = z.object({ to: Email, firstName: z.string().max(200) });

/** Collects the `x-mail-usage-warning` header of the one call it is passed to. */
function usageWarningsOf() {
  let warnings: UsageWarningHeaderEntry[] = [];
  return { onResponse: (meta: ResponseMeta) => void (warnings = meta.usageWarnings), get: () => warnings };
}

export async function sendTest(
  ws: string,
  id: string,
  input: z.input<typeof TestInput>,
): Promise<ActionResult<MailingTestResult & { usageWarnings: UsageWarningHeaderEntry[] }>> {
  const parsed = parseInput(TestInput, input);
  if (!parsed.ok) return parsed;
  return act('mailings.test', async () => {
    const { api } = await mail(ws);
    const usage = usageWarningsOf();
    const result = await api.mailings.test(
      id,
      {
        to: parsed.data.to,
        ...(parsed.data.firstName.trim() ? { merge: { first_name: parsed.data.firstName.trim() } } : {}),
      },
      { onResponse: usage.onResponse },
    );
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    return { ...result, usageWarnings: usage.get() };
  });
}

/** Starts sending; the plan's usage warning from the response comes back with the mailing. */
export async function sendMailing(ws: string, id: string): Promise<ActionResult<{ mailing: Mailing; usageWarnings: UsageWarningHeaderEntry[] }>> {
  return act('mailings.send', async () => {
    const { api } = await mail(ws);
    const usage = usageWarningsOf();
    const mailing = await api.mailings.send(id, { onResponse: usage.onResponse });
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    revalidatePath(mailingsPath(ws));
    return { mailing, usageWarnings: usage.get() };
  });
}

/** The newest test message of a mailing, from the archive. */
export async function latestTest(ws: string, id: string): Promise<ActionResult<MessageSummary | null>> {
  return act('messages.latestTest', async () => {
    const { api } = await mail(ws);
    for await (const m of api.paginate('messages.list', { query: { mailing_id: id, limit: 100 } })) {
      if (m.is_test) return m;
    }
    return null;
  });
}

type Control = 'pause' | 'resume' | 'cancel';

export async function controlMailing(ws: string, id: string, control: Control): Promise<ActionResult<Mailing>> {
  if (!['pause', 'resume', 'cancel'].includes(control)) {
    return { ok: false, error: { code: 'invalid_request', message: 'Unknown action.' } };
  }
  return act(`mailings.${control}`, async () => {
    const { api } = await mail(ws);
    const mailing = await api.mailings[control](id);
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    revalidatePath(mailingsPath(ws));
    return mailing;
  });
}

export async function retryFailed(ws: string, id: string, includeOutcomeUnknown: boolean): Promise<ActionResult<Mailing>> {
  return act('mailings.retryFailed', async () => {
    const { api } = await mail(ws);
    const mailing = await api.mailings.retryFailed(id, includeOutcomeUnknown ? { include_outcome_unknown: true } : {});
    revalidatePath(`${mailingsPath(ws)}/${id}`);
    return mailing;
  });
}

export async function duplicateMailing(ws: string, id: string): Promise<ActionResult<{ id: string }>> {
  return act('mailings.duplicate', async () => {
    const { api } = await mail(ws);
    const copy = await api.mailings.duplicate(id);
    revalidatePath(mailingsPath(ws));
    return { id: copy.id };
  });
}

/** Refuses early, with the reason, what the service would refuse at send time anyway. */
export async function preflight(ws: string, id: string): Promise<ActionResult<{ recipients: number; remainingBudget: number | null; compileErrors: number; hasUnsubscribe: boolean }>> {
  return act('mailings.preflight', async () => {
    const { api } = await mail(ws);
    const mailing = await api.mailings.get(id);
    const [compiled, usage] = await Promise.all([api.compile({ document: mailing.document }), api.providers.usage(mailing.provider_id).catch(() => null)]);
    return {
      recipients: mailing.counts.total,
      remainingBudget: usage ? usage.remaining_budget : null,
      compileErrors: compiled.errors.length,
      hasUnsubscribe: missingRequiredMergeFields(compiled.html).length === 0,
    };
  });
}
