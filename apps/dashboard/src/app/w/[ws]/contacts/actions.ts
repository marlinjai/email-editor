'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CONTACT_PROPERTY_TYPES, ContactPropertyKey, MailApiError, Slug, type ContactPropertyDefinition, type Tag } from '@marlinjai/mail-sdk';
import { act, DashboardRefusal, parseInput } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

/*
 * The contact area's own resources: tags and typed contact properties, and
 * putting tags on one contact. Segments, imports and signup forms have their
 * own action modules beside their screens.
 */

const contactsPath = (ws: string) => `/w/${ws}/contacts`;

// Tags

const TagInput = z.object({
  name: z.string().trim().min(1, 'Give the tag a name').max(120),
  slug: Slug,
});

export async function createTag(ws: string, input: z.input<typeof TagInput>): Promise<ActionResult<Tag>> {
  const parsed = parseInput(TagInput, input);
  if (!parsed.ok) return parsed;
  return act('tags.create', async () => {
    const { api } = await mail(ws);
    const tag = await api.tags.create(parsed.data);
    revalidatePath(`${contactsPath(ws)}/tags`);
    return tag;
  });
}

export async function deleteTag(ws: string, id: string): Promise<ActionResult> {
  return act('tags.delete', async () => {
    const { api } = await mail(ws);
    await api.tags.delete(id);
    revalidatePath(contactsPath(ws), 'layout');
    return null;
  });
}

/** Adds or removes one tag on one contact. Both are idempotent at the service. */
export async function setContactTag(ws: string, contactId: string, slug: string, on: boolean): Promise<ActionResult> {
  return act(on ? 'tags.assign' : 'tags.unassign', async () => {
    const { api } = await mail(ws);
    // The routes take the tag's id; the contact carries slugs.
    let tag: Tag | undefined;
    for await (const t of api.paginate('tags.list', { query: { limit: 100 } })) {
      if (t.slug === slug) {
        tag = t;
        break;
      }
    }
    if (!tag) throw new DashboardRefusal('not_found', `The tag ${slug} no longer exists. Reload to see the current tags.`);
    const body = { contact_ids: [contactId] };
    if (on) await api.tags.assign(tag.id, body);
    else await api.tags.unassign(tag.id, body);
    revalidatePath(`${contactsPath(ws)}/${contactId}`);
    return null;
  });
}

// Contact properties

const PropertyInput = z.object({
  key: ContactPropertyKey,
  label: z.string().trim().min(1, 'Give the property a label').max(120),
  type: z.enum(CONTACT_PROPERTY_TYPES),
});

export async function createProperty(ws: string, input: z.input<typeof PropertyInput>): Promise<ActionResult<ContactPropertyDefinition>> {
  const parsed = parseInput(PropertyInput, input);
  if (!parsed.ok) return parsed;
  return act('contactProperties.create', async () => {
    const { api } = await mail(ws);
    try {
      const created = await api.contactProperties.create(parsed.data);
      revalidatePath(`${contactsPath(ws)}/properties`);
      return created;
    } catch (err) {
      // Not a concurrent edit: contacts already hold values of another type,
      // which the service names. Say that, not "someone else changed this".
      if (err instanceof MailApiError && err.code === 'conflict') throw new DashboardRefusal('conflict', err.message);
      throw err;
    }
  });
}

export async function deleteProperty(ws: string, key: string): Promise<ActionResult> {
  return act('contactProperties.delete', async () => {
    const { api } = await mail(ws);
    await api.contactProperties.delete(key);
    revalidatePath(`${contactsPath(ws)}/properties`);
    return null;
  });
}
