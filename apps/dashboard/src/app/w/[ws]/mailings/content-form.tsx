'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useSaved } from '@/components/saved';
import { Button, describedBy, Field, Input, Select } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { createMailing, updateMailing } from './actions';

type Content = { name: string; subject: string; preheader: string; topic: string; providerId: string };

/** The mailing's envelope: subject, preview text, topic and provider. Creating also picks the template. */
export function MailingContentForm({
  ws,
  mode,
  topics,
  providers,
  initial,
  disabled = false,
  onSaved,
}: {
  ws: string;
  mode: { kind: 'create'; templates: Array<{ id: string; name: string }>; templateId: string } | { kind: 'edit'; mailingId: string };
  topics: Array<{ slug: string; name: string }>;
  providers: Array<{ id: string; name: string; from: string }>;
  initial: Content;
  disabled?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const saved = useSaved();
  const [c, setC] = useState<Content>(initial);
  const [templateId, setTemplateId] = useState(mode.kind === 'create' ? mode.templateId : '');
  const set = <K extends keyof Content>(k: K, v: string) => setC((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="flex max-w-[720px] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode.kind === 'create') {
          void run(() => createMailing(ws, { ...c, templateId }), (r) => router.push(`/w/${ws}/mailings/${r.id}`));
        } else {
          void run(() => updateMailing(ws, mode.mailingId, c), () => {
            saved.mark();
            onSaved?.();
            router.refresh();
          });
        }
      }}
    >
      <fieldset disabled={disabled} className="contents">
        {mode.kind === 'create' ? (
          <Field id="m-template" label="Template" error={fields.templateId}>
            <Select {...describedBy('m-template', fields.templateId)} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {mode.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id="m-subject" label="Subject" error={fields.subject}>
          <Input {...describedBy('m-subject', fields.subject)} value={c.subject} onChange={(e) => set('subject', e.target.value)} maxLength={998} required />
        </Field>
        <Field id="m-preheader" label="Preview text (optional)" hint="Shown after the subject in most inboxes." error={fields.preheader}>
          <Input {...describedBy('m-preheader', fields.preheader, true)} value={c.preheader} onChange={(e) => set('preheader', e.target.value)} maxLength={500} />
        </Field>
        <Field id="m-name" label="Internal name (optional)" hint="Only you see it, in lists here. The subject is used when empty." error={fields.name}>
          <Input {...describedBy('m-name', fields.name, true)} value={c.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="m-topic" label="Topic" hint="Recipients unsubscribed from it are skipped." error={fields.topic}>
            <Select {...describedBy('m-topic', fields.topic, true)} value={c.topic} onChange={(e) => set('topic', e.target.value)}>
              {topics.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="m-provider" label="Sent through" error={fields.providerId}>
            <Select {...describedBy('m-provider', fields.providerId)} value={c.providerId} onChange={(e) => set('providerId', e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}: {p.from}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>
      <FormError error={error} />
      {!disabled ? (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" busy={pending}>
            {mode.kind === 'create' ? 'Create mailing' : 'Save details'}
          </Button>
          {saved.node}
        </div>
      ) : null}
    </form>
  );
}
