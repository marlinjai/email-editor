'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { HOSTED_PAGE_LOCALES, SIGNUP_FORM_FIELDS, Slug, type SignupForm } from '@marlinjai/mail-sdk';
import { act, parseInput } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

const formsPath = (ws: string) => `/w/${ws}/contacts/forms`;

const optionalUrl = z.union([z.literal(''), z.string().trim().url('A full address, starting with https://')]);

const FormInput = z.object({
  name: z.string().trim().min(1, 'Give the form a name').max(120),
  title: z.string().trim().min(1, 'The page needs a heading').max(120),
  consentText: z.string().trim().min(1, 'Say what people agree to').max(2000),
  translations: z.array(z.object({ locale: z.enum(HOSTED_PAGE_LOCALES), title: z.string().trim().max(120), consentText: z.string().trim().max(2000) })),
  topics: z.array(Slug).min(1, 'Choose at least one topic'),
  tags: z.array(Slug),
  fields: z.array(z.enum(SIGNUP_FORM_FIELDS)),
  providerId: z.string().min(1, 'Choose the provider the confirmation mail goes through'),
  confirmationTemplateId: z.string(),
  redirectUrl: optionalUrl,
  allowedOrigins: z.array(z.string().trim().min(1)).max(20, 'At most 20 sites'),
});

export async function saveSignupForm(ws: string, id: string | null, input: z.input<typeof FormInput>): Promise<ActionResult<SignupForm>> {
  const parsed = parseInput(FormInput, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  // A language is kept only when both its heading and its consent text are filled in.
  const translations = Object.fromEntries(
    f.translations.filter((t) => t.title !== '' && t.consentText !== '').map((t) => [t.locale, { title: t.title, consent_text: t.consentText }]),
  );
  const body = {
    name: f.name,
    title: f.title,
    consent_text: f.consentText,
    translations,
    topics: f.topics,
    tags: f.tags,
    fields: f.fields,
    provider_id: f.providerId,
    confirmation_template_id: f.confirmationTemplateId === '' ? null : f.confirmationTemplateId,
    redirect_url: f.redirectUrl === '' ? null : f.redirectUrl,
    allowed_origins: f.allowedOrigins,
  };
  return act(id ? 'signupForms.update' : 'signupForms.create', async () => {
    const { api } = await mail(ws);
    const saved = id ? await api.signupForms.update(id, body) : await api.signupForms.create(body);
    revalidatePath(formsPath(ws), 'layout');
    return saved;
  });
}

export async function deleteSignupForm(ws: string, id: string): Promise<ActionResult> {
  return act('signupForms.delete', async () => {
    const { api } = await mail(ws);
    await api.signupForms.delete(id);
    revalidatePath(formsPath(ws), 'layout');
    return null;
  });
}
