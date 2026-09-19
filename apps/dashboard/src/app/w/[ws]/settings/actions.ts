'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ApiKeyScope,
  Email,
  MemberRole,
  ProviderEventsSecret,
  ProviderPolicy,
  Slug,
  WEBHOOK_EVENT_TYPES,
  WebhookUrl,
  type ApiKeyCreated,
  type ProviderUsage,
  type ProviderVerifyResult,
} from '@marlinjai/mail-sdk';
import { act, parseInput } from '@/lib/action';
import { auth } from '@/lib/auth';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

/*
 * Workspace settings. Every action names the workspace it acts on; the mail
 * service checks the signed-in person's role there on each call, so these only
 * shape input and translate errors.
 */

const settingsPath = (ws: string, sub = '') => `/w/${ws}/settings${sub}`;

// General

const Locale = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, 'A language tag such as de, en or pt-BR');

const GeneralInput = z
  .object({
    name: z.string().trim().min(1, 'Give the workspace a name').max(120),
    locales: z.array(Locale).min(1, 'At least one language').max(20),
    defaultLocale: Locale,
    trackingEnabled: z.boolean(),
    assetPolicy: z.enum(['any', 'service_only']),
  })
  .refine((v) => v.locales.includes(v.defaultLocale), {
    message: 'The default language must be one of the languages',
    path: ['defaultLocale'],
  });

export async function updateGeneral(ws: string, input: z.input<typeof GeneralInput>): Promise<ActionResult> {
  const parsed = parseInput(GeneralInput, input);
  if (!parsed.ok) return parsed;
  return act('workspace.update', async () => {
    const { api } = await mail(ws);
    await api.workspace.update({
      name: parsed.data.name,
      settings: {
        locales: parsed.data.locales,
        default_locale: parsed.data.defaultLocale,
        tracking_enabled: parsed.data.trackingEnabled,
        asset_policy: parsed.data.assetPolicy,
      },
    });
    revalidatePath(`/w/${ws}`, 'layout');
    return null;
  });
}

// Members and invitations

export async function changeRole(ws: string, memberId: string, role: z.infer<typeof MemberRole>): Promise<ActionResult> {
  const parsed = parseInput(MemberRole, role);
  if (!parsed.ok) return parsed;
  return act('members.update', async () => {
    const { api } = await mail(ws);
    await api.members.update(memberId, { role: parsed.data });
    revalidatePath(settingsPath(ws, '/members'));
    return null;
  });
}

export async function removeMember(ws: string, memberId: string): Promise<ActionResult> {
  return act('members.remove', async () => {
    const { api } = await mail(ws);
    await api.members.remove(memberId);
    revalidatePath(settingsPath(ws, '/members'));
    return null;
  });
}

const InviteInput = z.object({ email: Email, role: MemberRole });

/**
 * An invitation (the service's `invites.create`): one address, one role, seven
 * days. The token comes back once and becomes the link the admin sends; the
 * service keeps only its hash, and it can be revoked until it is used.
 */
export async function inviteMember(ws: string, input: z.input<typeof InviteInput>): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const parsed = parseInput(InviteInput, input);
  if (!parsed.ok) return parsed;
  return act('invites.create', async () => {
    const { api } = await mail(ws);
    const created = await api.invites.create({ email: parsed.data.email, role: parsed.data.role });
    revalidatePath(settingsPath(ws, '/members'));
    return { url: `${auth.appUrl()}/invite/${created.token}`, expiresAt: created.invite.expires_at };
  });
}

export async function revokeInvite(ws: string, inviteId: string): Promise<ActionResult> {
  return act('invites.revoke', async () => {
    const { api } = await mail(ws);
    await api.invites.revoke(inviteId);
    revalidatePath(settingsPath(ws, '/members'));
    return null;
  });
}

// API keys

const ApiKeyInput = z.object({ name: z.string().trim().min(1, 'Name the key after what uses it').max(120), scope: ApiKeyScope });

export async function createApiKey(ws: string, input: z.input<typeof ApiKeyInput>): Promise<ActionResult<ApiKeyCreated>> {
  const parsed = parseInput(ApiKeyInput, input);
  if (!parsed.ok) return parsed;
  return act('apiKeys.create', async () => {
    const { api } = await mail(ws);
    const created = await api.apiKeys.create({ name: parsed.data.name, scope: parsed.data.scope });
    revalidatePath(settingsPath(ws, '/api-keys'));
    return created;
  });
}

export async function revokeApiKey(ws: string, keyId: string): Promise<ActionResult> {
  return act('apiKeys.revoke', async () => {
    const { api } = await mail(ws);
    await api.apiKeys.revoke(keyId);
    revalidatePath(settingsPath(ws, '/api-keys'));
    return null;
  });
}

// Providers

const Port = z.coerce.number().int().min(1).max(65535);

const ProviderInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('smtp'),
    name: z.string().trim().min(1, 'Name the provider').max(120),
    fromName: z.string().trim().min(1, 'The sender name people see').max(120),
    fromEmail: Email,
    replyTo: z.union([Email, z.literal('')]),
    host: z.string().trim().min(1, 'The SMTP host').max(255),
    port: Port,
    security: z.enum(['tls', 'starttls']),
    username: z.string().trim().min(1, 'The SMTP user name').max(255),
    /** Write-only: empty on an update keeps the stored one. */
    secret: z.string().max(1024),
    policy: ProviderPolicy,
  }),
  z.object({
    kind: z.literal('resend'),
    name: z.string().trim().min(1, 'Name the provider').max(120),
    fromName: z.string().trim().min(1, 'The sender name people see').max(120),
    fromEmail: Email,
    replyTo: z.union([Email, z.literal('')]),
    secret: z.string().max(1024),
    policy: ProviderPolicy,
  }),
]);
export type ProviderFormInput = z.input<typeof ProviderInput>;

/**
 * Creates a provider, or updates one when `providerId` is given. The secret
 * (SMTP password or Resend API key) travels only from this form to the service,
 * which stores it sealed and never returns it; an empty secret on an update
 * keeps the stored one.
 */
export async function saveProvider(ws: string, providerId: string | null, input: ProviderFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(ProviderInput, input);
  if (!parsed.ok) return parsed;
  const p = parsed.data;
  if (!providerId && p.secret.length === 0) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Some fields need attention.',
        fields: { secret: p.kind === 'smtp' ? 'The SMTP password is required' : 'The Resend API key is required' },
      },
    };
  }
  const common = {
    name: p.name,
    from_name: p.fromName,
    from_email: p.fromEmail,
    reply_to: p.replyTo === '' ? null : p.replyTo,
    policy: p.policy,
  };
  return act(providerId ? 'providers.update' : 'providers.create', async () => {
    const { api } = await mail(ws);
    let id: string;
    if (providerId) {
      const secret = p.secret.length > 0 ? p.secret : undefined;
      const updated =
        p.kind === 'smtp'
          ? await api.providers.update(providerId, {
              kind: 'smtp',
              ...common,
              config: { host: p.host, port: p.port, security: p.security, username: p.username, ...(secret ? { password: secret } : {}) },
            })
          : await api.providers.update(providerId, { kind: 'resend', ...common, ...(secret ? { config: { api_key: secret } } : {}) });
      id = updated.id;
    } else {
      const created =
        p.kind === 'smtp'
          ? await api.providers.create({
              kind: 'smtp',
              ...common,
              config: { host: p.host, port: p.port, security: p.security, username: p.username, password: p.secret },
            })
          : await api.providers.create({ kind: 'resend', ...common, config: { api_key: p.secret } });
      id = created.id;
    }
    revalidatePath(settingsPath(ws, '/providers'));
    return { id };
  });
}

export async function verifyProvider(ws: string, providerId: string): Promise<ActionResult<ProviderVerifyResult>> {
  return act('providers.verify', async () => (await mail(ws)).api.providers.verify(providerId));
}

/** Clears a provider's bounce anomaly after an admin checked the provider: bounce blocking, test sends and starts work again. */
export async function clearProviderAnomaly(ws: string, providerId: string): Promise<ActionResult> {
  return act('providers.clearAnomaly', async () => {
    const { api } = await mail(ws);
    await api.providers.clearAnomaly(providerId);
    revalidatePath(settingsPath(ws, '/providers'));
    return null;
  });
}

/** Stores the signing secret of a Resend events endpoint the member added at Resend by hand. */
export async function setProviderEventsSecret(ws: string, providerId: string, signingSecret: string): Promise<ActionResult> {
  const parsed = parseInput(ProviderEventsSecret, { signing_secret: signingSecret.trim() });
  if (!parsed.ok) return parsed;
  return act('providers.setEventsSecret', async () => {
    const { api } = await mail(ws);
    await api.providers.setEventsSecret(providerId, parsed.data);
    revalidatePath(settingsPath(ws, '/providers'));
    return null;
  });
}

export async function providerUsage(ws: string, providerId: string): Promise<ActionResult<ProviderUsage>> {
  return act('providers.usage', async () => (await mail(ws)).api.providers.usage(providerId));
}

export async function deleteProvider(ws: string, providerId: string): Promise<ActionResult> {
  return act('providers.delete', async () => {
    const { api } = await mail(ws);
    await api.providers.delete(providerId);
    revalidatePath(settingsPath(ws, '/providers'));
    return null;
  });
}

// Topics

const Translation = z.object({
  locale: Locale,
  name: z.string().trim().min(1, 'The translated name').max(120),
  description: z.string().max(1000),
});

const TopicInput = z.object({
  slug: Slug,
  name: z.string().trim().min(1, 'Name the topic as subscribers will see it').max(120),
  description: z.string().max(1000),
  translations: z.array(Translation).max(20),
});
export type TopicFormInput = z.input<typeof TopicInput>;

export async function saveTopic(ws: string, topicId: string | null, input: TopicFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(TopicInput, input);
  if (!parsed.ok) return parsed;
  const t = parsed.data;
  const locales = t.translations.map((x) => x.locale);
  if (new Set(locales).size !== locales.length) {
    return {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Each language can be translated once.',
        fields: { translations: 'A language appears twice' },
      },
    };
  }
  const translations = Object.fromEntries(
    t.translations.map((x) => [x.locale, { name: x.name, description: x.description.trim() === '' ? null : x.description }]),
  );
  return act(topicId ? 'topics.update' : 'topics.create', async () => {
    const { api } = await mail(ws);
    const saved = topicId
      ? await api.topics.update(topicId, { name: t.name, description: t.description, translations })
      : await api.topics.create({ slug: t.slug, name: t.name, description: t.description || undefined, translations });
    revalidatePath(settingsPath(ws, '/topics'));
    return { id: saved.id };
  });
}

// Webhooks

const WebhookInput = z.object({
  url: WebhookUrl,
  description: z.string().max(500),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, 'Choose at least one event'),
  enabled: z.boolean(),
});
export type WebhookFormInput = z.input<typeof WebhookInput>;

/** Creating answers with the signing secret, shown once; an update never does. */
export async function saveWebhook(
  ws: string,
  endpointId: string | null,
  input: WebhookFormInput,
): Promise<ActionResult<{ id: string; secret: string | null }>> {
  const parsed = parseInput(WebhookInput, input);
  if (!parsed.ok) return parsed;
  const w = parsed.data;
  return act(endpointId ? 'webhooks.update' : 'webhooks.create', async () => {
    const { api } = await mail(ws);
    let result: { id: string; secret: string | null };
    if (endpointId) {
      const updated = await api.webhooks.update(endpointId, {
        url: w.url,
        description: w.description.trim() === '' ? null : w.description,
        events: w.events,
        enabled: w.enabled,
      });
      result = { id: updated.id, secret: null };
    } else {
      const created = await api.webhooks.create({
        url: w.url,
        description: w.description || undefined,
        events: w.events,
        enabled: w.enabled,
      });
      result = { id: created.endpoint.id, secret: created.secret };
    }
    revalidatePath(settingsPath(ws, '/webhooks'));
    return result;
  });
}

export async function rotateWebhookSecret(ws: string, endpointId: string): Promise<ActionResult<{ secret: string }>> {
  return act('webhooks.rotateSecret', async () => {
    const { api } = await mail(ws);
    const rotated = await api.webhooks.rotateSecret(endpointId);
    return { secret: rotated.secret };
  });
}

export async function deleteWebhook(ws: string, endpointId: string): Promise<ActionResult> {
  return act('webhooks.delete', async () => {
    const { api } = await mail(ws);
    await api.webhooks.delete(endpointId);
    revalidatePath(settingsPath(ws, '/webhooks'));
    return null;
  });
}

export async function redeliverWebhook(ws: string, endpointId: string, deliveryId: string): Promise<ActionResult> {
  return act('webhooks.redeliver', async () => {
    const { api } = await mail(ws);
    await api.webhooks.redeliver(endpointId, deliveryId);
    revalidatePath(settingsPath(ws, `/webhooks/${endpointId}`));
    return null;
  });
}
