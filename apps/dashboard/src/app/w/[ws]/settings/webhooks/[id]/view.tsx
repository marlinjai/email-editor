'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { WebhookDelivery, WebhookDeliveryStatus, WebhookEndpoint } from '@marlinjai/mail-contract';
import { ConfirmDialog, SecretOnceDialog } from '@/components/dialog';
import { Badge, Button, EmptyState, LinkButton, Mono, Panel, Section, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { deleteWebhook, redeliverWebhook, rotateWebhookSecret } from '../../actions';
import { EVENT_LABELS, WebhookForm } from '../form';

const STATUS_TONE: Record<WebhookDeliveryStatus, 'neutral' | 'ok' | 'danger'> = { pending: 'neutral', succeeded: 'ok', failed: 'danger' };
const STATUS_LABEL: Record<WebhookDeliveryStatus, string> = { pending: 'Pending', succeeded: 'Delivered', failed: 'Failed' };

function Redeliver({ ws, endpointId, delivery }: { ws: string; endpointId: string; delivery: WebhookDelivery }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        busy={pending}
        onClick={() =>
          void run(
            () => redeliverWebhook(ws, endpointId, delivery.id),
            () => router.refresh(),
          )
        }
      >
        Redeliver
      </Button>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error.message}
        </span>
      ) : null}
    </span>
  );
}

export function EndpointView({
  ws,
  endpoint,
  deliveries,
  nextCursor,
  status,
}: {
  ws: string;
  endpoint: WebhookEndpoint;
  deliveries: WebhookDelivery[];
  nextCursor: string | null;
  status: WebhookDeliveryStatus | null;
}) {
  const router = useRouter();
  const base = `/w/${ws}/settings/webhooks/${endpoint.id}`;
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/settings/webhooks`} className="text-[12.5px] text-muted hover:text-ink">
          ← All endpoints
        </Link>
      </div>
      <Panel className="p-5">
        {editing ? (
          <WebhookForm
            ws={ws}
            endpoint={endpoint}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Mono className="block truncate text-[14px] text-ink">{endpoint.url}</Mono>
              {endpoint.description ? <p className="mt-1 text-[13px] text-muted">{endpoint.description}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={endpoint.enabled ? 'ok' : 'neutral'}>{endpoint.enabled ? 'Enabled' : 'Disabled'}</Badge>
                {endpoint.events.map((e) => (
                  <Badge key={e}>{EVENT_LABELS[e]}</Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button onClick={() => setRotating(true)}>Rotate secret</Button>
              <Button variant="ghost" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Section
        title="Deliveries"
        description="Newest first. A failed delivery can be sent again; it is signed afresh with the current secret."
        actions={
          <nav aria-label="Filter deliveries" className="flex gap-1">
            {([null, 'pending', 'succeeded', 'failed'] as const).map((s) => (
              <LinkButton
                key={s ?? 'all'}
                href={s ? `${base}?status=${s}` : base}
                variant={status === s ? 'secondary' : 'ghost'}
                aria-current={status === s ? 'page' : undefined}
              >
                {s ? STATUS_LABEL[s] : 'All'}
              </LinkButton>
            ))}
          </nav>
        }
      >
        {deliveries.length === 0 ? (
          <EmptyState title={status ? `No ${STATUS_LABEL[status].toLowerCase()} deliveries` : 'No deliveries yet'}>
            Deliveries appear here as soon as one of the chosen events happens in this workspace.
          </EmptyState>
        ) : (
          <>
            <Table label="Webhook deliveries">
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Status</Th>
                  <Th>Attempts</Th>
                  <Th>Last answer</Th>
                  <Th>Created</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <Mono className="text-ink">{d.event_type}</Mono>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                      {d.status === 'pending' && d.next_attempt_at ? (
                        <span className="mt-0.5 block text-[12px] text-faint">
                          next <When at={d.next_attempt_at} />
                        </span>
                      ) : null}
                    </Td>
                    <Td className="tabular">{d.attempts}</Td>
                    <Td>
                      {d.last_status_code ? <Mono>HTTP {d.last_status_code}</Mono> : null}
                      {d.last_error ? (
                        <span className="block max-w-[32ch] truncate text-[12px] text-danger" title={d.last_error}>
                          {d.last_error}
                        </span>
                      ) : null}
                      {!d.last_status_code && !d.last_error ? <span className="text-faint">none yet</span> : null}
                    </Td>
                    <Td>
                      <When at={d.created_at} />
                    </Td>
                    <Td className="text-right">
                      {d.status !== 'pending' ? <Redeliver ws={ws} endpointId={endpoint.id} delivery={d} /> : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {nextCursor ? (
              <div className="mt-3 flex justify-end">
                <LinkButton href={`${base}?${new URLSearchParams({ ...(status ? { status } : {}), cursor: nextCursor })}`}>
                  Older deliveries
                </LinkButton>
              </div>
            ) : null}
          </>
        )}
      </Section>

      <ConfirmDialog
        open={rotating}
        onClose={() => setRotating(false)}
        title="Rotate the signing secret?"
        description="A new secret is shown once. For the next 24 hours every request is signed with both the old and the new secret, so you can update your application without dropping events."
        confirmLabel="Rotate secret"
        tone="primary"
        action={async () => {
          const r = await rotateWebhookSecret(ws, endpoint.id);
          if (r.ok) setSecret(r.data.secret);
          return r;
        }}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this endpoint?"
        description="No further events are sent to it, and its pending deliveries are dropped. This cannot be undone."
        confirmLabel="Delete endpoint"
        action={() => deleteWebhook(ws, endpoint.id)}
        onDone={() => router.push(`/w/${ws}/settings/webhooks`)}
      />
      <SecretOnceDialog open={secret !== null} onClose={() => setSecret(null)} title="New signing secret" secret={secret ?? ''} />
    </>
  );
}
