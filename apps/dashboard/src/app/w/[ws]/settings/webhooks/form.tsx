'use client';

import { useState } from 'react';
import { WEBHOOK_EVENT_TYPES, type WebhookEndpoint, type WebhookEventType } from '@marlinjai/mail-contract';
import { FormError } from '@/components/form-error';
import { Button, describedBy, Field, Input } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { saveWebhook } from '../actions';

export const EVENT_LABELS: Record<WebhookEventType, string> = {
  'message.sent': 'A message was sent',
  'message.failed': 'A message failed',
  'contact.unsubscribed': 'Someone unsubscribed',
  'contact.resubscribed': 'Someone subscribed again',
  'contact.bounced': 'An address bounced or complained',
  'mailing.finished': 'A mailing finished',
};

/** Creating or editing an endpoint. On create, `onDone` receives the signing secret to show once. */
export function WebhookForm({
  ws,
  endpoint,
  onDone,
  onCancel,
}: {
  ws: string;
  endpoint: WebhookEndpoint | null;
  onDone: (result: { id: string; secret: string | null }) => void;
  onCancel: () => void;
}) {
  const { run, pending, error, fields } = useAction();
  const [url, setUrl] = useState(endpoint?.url ?? '');
  const [description, setDescription] = useState(endpoint?.description ?? '');
  const [events, setEvents] = useState<WebhookEventType[]>(endpoint?.events ?? [...WEBHOOK_EVENT_TYPES]);
  const [enabled, setEnabled] = useState(endpoint?.enabled ?? true);
  const idp = endpoint ? `wh-${endpoint.id}` : 'wh-new';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveWebhook(ws, endpoint?.id ?? null, { url, description, events, enabled }), onDone);
      }}
    >
      <Field
        id={`${idp}-url`}
        label="Endpoint URL"
        hint="HTTPS, reachable from the internet. Requests are signed; verify them with the secret."
        error={fields.url}
      >
        <Input
          {...describedBy(`${idp}-url`, fields.url, true)}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          spellCheck={false}
          className="font-mono"
        />
      </Field>
      <Field id={`${idp}-desc`} label="Description (optional)" error={fields.description}>
        <Input
          {...describedBy(`${idp}-desc`, fields.description)}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[12.5px] font-medium text-muted">Events</legend>
        {WEBHOOK_EVENT_TYPES.map((ev) => (
          <label key={ev} className="flex items-center gap-2.5 text-[13.5px] text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--gold)]"
              checked={events.includes(ev)}
              onChange={(e) => setEvents((xs) => (e.target.checked ? [...xs, ev] : xs.filter((x) => x !== ev)))}
            />
            {EVENT_LABELS[ev]} <span className="font-mono text-[12px] text-faint">{ev}</span>
          </label>
        ))}
        {fields.events ? <p className="text-[12.5px] text-danger">{fields.events}</p> : null}
      </fieldset>
      <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
        <input type="checkbox" className="size-4 accent-[var(--gold)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enabled
        <span className="text-[12.5px] text-faint">A disabled endpoint keeps its pending deliveries until it is enabled again.</span>
      </label>
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={pending}>
          {endpoint ? 'Save endpoint' : 'Add endpoint'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
