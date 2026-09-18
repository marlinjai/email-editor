'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Email, Slug, type ContactErased } from '@marlinjai/mail-sdk';
import { act, parseInput } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

/*
 * Suppressions and contacts: who may not be mailed, and who the service knows.
 */

const SuppressionInput = z.object({
  email: Email,
  reason: z.enum(['manual', 'unsubscribed']),
  topic: z.union([Slug, z.literal('')]),
  note: z.string().max(1000),
});

export async function addSuppression(ws: string, input: z.input<typeof SuppressionInput>): Promise<ActionResult> {
  const parsed = parseInput(SuppressionInput, input);
  if (!parsed.ok) return parsed;
  const s = parsed.data;
  return act('suppressions.create', async () => {
    const { api } = await mail(ws);
    await api.suppressions.create({ email: s.email, reason: s.reason, topic: s.topic === '' ? null : s.topic, ...(s.note.trim() ? { note: s.note.trim() } : {}) });
    revalidatePath(`/w/${ws}/suppressions`);
    return null;
  });
}

export async function removeSuppression(ws: string, id: string): Promise<ActionResult> {
  return act('suppressions.delete', async () => {
    const { api } = await mail(ws);
    await api.suppressions.delete(id);
    revalidatePath(`/w/${ws}/suppressions`);
    return null;
  });
}

/**
 * Erasure (Art. 17 of the General Data Protection Regulation, GDPR): the
 * contact, the recipient rows and the archived HTML sent to it go; its
 * suppressions stay, so the person is never mailed again by mistake.
 */
export async function eraseContact(ws: string, id: string): Promise<ActionResult<ContactErased>> {
  return act('contacts.erase', async () => {
    const { api } = await mail(ws);
    const result = await api.contacts.erase(id);
    revalidatePath(`/w/${ws}/contacts`);
    return result;
  });
}
