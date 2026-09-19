'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Tag } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Button, describedBy, EmptyState, Field, Input, Mono, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatCount, slugify } from '@/lib/format';
import { createTag, deleteTag } from '../actions';

/** Labels on contacts, for segments and imports to select by. */
export function TagsView({ ws, tags, canWrite }: { ws: string; tags: Tag[]; canWrite: boolean }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [removing, setRemoving] = useState<Tag | null>(null);

  return (
    <>
      <PageHeader
        title="Tags"
        description="Labels on contacts: set on a contact, by an import or by a signup form, and used by segments to pick an audience."
      />
      {canWrite ? (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => createTag(ws, { name, slug }),
              () => {
                setName('');
                setSlug('');
                setSlugTouched(false);
                router.refresh();
              },
            );
          }}
        >
          <Field id="tag-name" label="New tag" error={fields.name} className="w-64">
            <Input
              {...describedBy('tag-name', fields.name)}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Workshop 2026"
              required
            />
          </Field>
          <Field id="tag-slug" label="Slug" error={fields.slug} className="w-56">
            <Input
              {...describedBy('tag-slug', fields.slug)}
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              className="font-mono"
              spellCheck={false}
              required
            />
          </Field>
          <Button type="submit" variant="primary" busy={pending}>
            Add tag
          </Button>
          <div className="basis-full">
            <FormError error={error && !error.fields ? error : null} />
          </div>
        </form>
      ) : null}
      {tags.length === 0 ? (
        <EmptyState title="No tags yet">A tag groups contacts for a segment, for example everyone who came to a workshop.</EmptyState>
      ) : (
        <Table label="Tags">
          <thead>
            <tr>
              <Th>Tag</Th>
              <Th>Slug</Th>
              <Th className="text-right">Contacts</Th>
              <Th>Created</Th>
              {canWrite ? <Th className="w-0">
                  <span className="sr-only">Actions</span>
                </Th> : null}
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <Td>{t.name}</Td>
                <Td>
                  <Mono>{t.slug}</Mono>
                </Td>
                <Td className="tabular text-right">{formatCount(t.contact_count)}</Td>
                <Td>
                  <When at={t.created_at} />
                </Td>
                {canWrite ? (
                  <Td>
                    <Button variant="ghost" onClick={() => setRemoving(t)} aria-label={`Delete tag ${t.name}`}>
                      Delete
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Delete the tag ${removing?.name ?? ''}?`}
        description={`It comes off ${formatCount(removing?.contact_count ?? 0)} contacts. The contacts stay. A segment that selects by this tag then matches nobody through it.`}
        confirmLabel="Delete tag"
        action={() => deleteTag(ws, removing!.id)}
        onDone={() => router.refresh()}
      />
    </>
  );
}
