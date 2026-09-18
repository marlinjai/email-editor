'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Tag } from '@marlinjai/mail-contract';
import { FormError } from '@/components/form-error';
import { Badge, Button, Select } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { setContactTag } from '../actions';

/** The contact's tags, each removable, and a picker for the workspace's other tags. */
export function ContactTags({ ws, contactId, tags, all, canWrite }: { ws: string; contactId: string; tags: string[]; all: Tag[]; canWrite: boolean }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [adding, setAdding] = useState('');
  const available = all.filter((t) => !tags.includes(t.slug));
  const nameOf = (slug: string) => all.find((t) => t.slug === slug)?.name ?? slug;
  const change = (slug: string, on: boolean) =>
    void run(
      () => setContactTag(ws, contactId, slug, on),
      () => {
        setAdding('');
        router.refresh();
      },
    );

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Tags">
        {tags.length === 0 ? <li className="text-faint">no tags</li> : null}
        {tags.map((slug) => (
          <li key={slug}>
            <Badge tone="gold">
              {nameOf(slug)}
              {canWrite ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => change(slug, false)}
                  aria-label={`Remove the tag ${nameOf(slug)}`}
                  className="-mr-0.5 rounded px-0.5 text-muted hover:text-ink disabled:opacity-45"
                >
                  ×
                </button>
              ) : null}
            </Badge>
          </li>
        ))}
      </ul>
      {canWrite && available.length > 0 ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding) change(adding, true);
          }}
        >
          <Select aria-label="Tag to add" value={adding} onChange={(e) => setAdding(e.target.value)} className="h-8 w-48 text-[12.5px]">
            <option value="">Add a tag</option>
            {available.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={!adding} busy={pending} className="h-8">
            Add
          </Button>
        </form>
      ) : null}
      <FormError error={error} />
    </div>
  );
}
