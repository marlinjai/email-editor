'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Topic } from '@marlinjai/mail-contract';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, EmptyState, Field, Input, Mono, Panel, Section, Textarea } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { slugify } from '@/lib/format';
import { saveTopic } from '../actions';

type Translation = { locale: string; name: string; description: string };

function TopicForm({
  ws,
  topic,
  locales,
  defaultLocale,
  onDone,
  onCancel,
}: {
  ws: string;
  topic: Topic | null;
  locales: string[];
  defaultLocale: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { run, pending, error, fields } = useAction();
  const [name, setName] = useState(topic?.name ?? '');
  const [slug, setSlug] = useState(topic?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(topic !== null);
  const [description, setDescription] = useState(topic?.description ?? '');
  // One row per workspace language other than the default (the name and
  // description above are the default language's text).
  const [translations, setTranslations] = useState<Translation[]>(() =>
    // Translations kept for a language the workspace no longer lists stay too,
    // so saving never silently drops text someone wrote.
    [...new Set([...locales, ...Object.keys(topic?.translations ?? {})])]
      .filter((l) => l !== defaultLocale)
      .map((l) => ({ locale: l, name: topic?.translations[l]?.name ?? '', description: topic?.translations[l]?.description ?? '' })),
  );
  const idp = topic ? `t-${topic.id}` : 't-new';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const filled = translations.filter((t) => t.name.trim() !== '');
        void run(() => saveTopic(ws, topic?.id ?? null, { slug, name, description, translations: filled }), onDone);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idp}-name`} label={`Name (${defaultLocale})`} error={fields.name}>
          <Input
            {...describedBy(`${idp}-name`, fields.name)}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
          />
        </Field>
        <Field
          id={`${idp}-slug`}
          label="Slug"
          hint={topic ? 'Fixed once created: clients send it with every mailing.' : 'What clients send with a mailing.'}
          error={fields.slug}
        >
          <Input
            {...describedBy(`${idp}-slug`, fields.slug, true)}
            value={slug}
            disabled={topic !== null}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            className="font-mono"
            spellCheck={false}
          />
        </Field>
      </div>
      <Field
        id={`${idp}-desc`}
        label={`Description (${defaultLocale})`}
        hint="Shown on the unsubscribe page under the topic's name."
        error={fields.description}
      >
        <Textarea
          {...describedBy(`${idp}-desc`, fields.description, true)}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {translations.length > 0 ? (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <legend className="px-1 text-[12.5px] font-medium text-muted">Translations</legend>
          {fields.translations ? <p className="text-[12.5px] text-danger">{fields.translations}</p> : null}
          {translations.map((t, i) => (
            <div key={t.locale} className="grid gap-3 sm:grid-cols-[48px_1fr_2fr] sm:items-start">
              <Mono className="pt-2 text-[12.5px]">{t.locale}</Mono>
              <Input
                aria-label={`Name in ${t.locale}`}
                placeholder={`Name in ${t.locale}`}
                value={t.name}
                onChange={(e) => setTranslations((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <Input
                aria-label={`Description in ${t.locale}`}
                placeholder="Description (optional)"
                value={t.description}
                onChange={(e) => setTranslations((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              />
            </div>
          ))}
          <p className="text-[12px] text-faint">A language left empty falls back to the default text.</p>
        </fieldset>
      ) : (
        <p className="text-[12.5px] text-faint">Add languages under General to translate this topic.</p>
      )}
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={pending}>
          {topic ? 'Save topic' : 'Create topic'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function TopicsView({
  ws,
  topics,
  canAdmin,
  locales,
  defaultLocale,
}: {
  ws: string;
  topics: Topic[];
  canAdmin: boolean;
  locales: string[];
  defaultLocale: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  return (
    <Section
      title="Topics"
      description="What people subscribe to. Every mailing goes out under one topic, and unsubscribing from one leaves the others untouched."
      actions={
        canAdmin && editing !== 'new' ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            New topic
          </Button>
        ) : null
      }
    >
      {editing === 'new' ? (
        <Panel className="mb-4 p-5">
          <TopicForm ws={ws} topic={null} locales={locales} defaultLocale={defaultLocale} onDone={done} onCancel={() => setEditing(null)} />
        </Panel>
      ) : null}
      {topics.length === 0 && editing !== 'new' ? (
        <EmptyState
          title="No topics yet"
          action={
            canAdmin ? (
              <Button variant="primary" onClick={() => setEditing('new')}>
                New topic
              </Button>
            ) : null
          }
        >
          Create one for each kind of mail you send, for example “Programme updates” and “Venue outreach”, so people can opt out of one
          without losing the other.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {topics.map((t) => (
            <Panel key={t.id} className="p-5">
              {editing === t.id ? (
                <TopicForm
                  ws={ws}
                  topic={t}
                  locales={locales}
                  defaultLocale={defaultLocale}
                  onDone={done}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-ink">{t.name}</h3>
                    <Mono>{t.slug}</Mono>
                    {t.description ? <p className="mt-1 max-w-[68ch] text-[13px] text-muted">{t.description}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.keys(t.translations).map((l) => (
                        <Badge key={l}>{l}</Badge>
                      ))}
                    </div>
                  </div>
                  {canAdmin ? <Button onClick={() => setEditing(t.id)}>Edit</Button> : null}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </Section>
  );
}
