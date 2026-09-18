'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { WebhookEndpoint } from '@marlinjai/mail-contract';
import { SecretOnceDialog } from '@/components/dialog';
import { Badge, Button, EmptyState, Mono, Panel, Section } from '@/components/ui';
import { WebhookForm } from './form';

export function WebhooksView({ ws, endpoints }: { ws: string; endpoints: WebhookEndpoint[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <Section
      title="Webhooks"
      description="Events sent to your own application as they happen: sends, failures, unsubscribes, bounces and finished mailings. Each is retried with backoff until your endpoint answers 2xx."
      actions={!adding ? <Button variant="primary" onClick={() => setAdding(true)}>Add endpoint</Button> : null}
    >
      {adding ? (
        <Panel className="mb-4 p-5">
          <WebhookForm
            ws={ws}
            endpoint={null}
            onCancel={() => setAdding(false)}
            onDone={(r) => {
              setAdding(false);
              setSecret(r.secret);
              router.refresh();
            }}
          />
        </Panel>
      ) : null}
      {endpoints.length === 0 && !adding ? (
        <EmptyState title="No endpoints yet" action={<Button variant="primary" onClick={() => setAdding(true)}>Add endpoint</Button>}>
          Add one to mirror sent mail and unsubscribes into your own records.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {endpoints.map((e) => (
            <Link key={e.id} href={`/w/${ws}/settings/webhooks/${e.id}`} className="block rounded-xl border border-line bg-panel px-5 py-4 transition-colors hover:border-line-strong">
              <div className="flex flex-wrap items-center gap-3">
                <Mono className="min-w-0 flex-1 truncate text-[13px] text-ink">{e.url}</Mono>
                <Badge tone={e.enabled ? 'ok' : 'neutral'}>{e.enabled ? 'Enabled' : 'Disabled'}</Badge>
                <span className="text-[12.5px] text-muted">{e.events.length} events</span>
              </div>
              {e.description ? <p className="mt-1 text-[13px] text-muted">{e.description}</p> : null}
            </Link>
          ))}
        </div>
      )}
      <SecretOnceDialog open={secret !== null} onClose={() => setSecret(null)} title="Signing secret" secret={secret ?? ''}>
        <p className="text-[12.5px] text-muted">
          Verify each request&apos;s <span className="font-mono">x-mail-signature</span> with it (the SDK&apos;s <span className="font-mono">verifyWebhook</span> does this).
        </p>
      </SecretOnceDialog>
    </Section>
  );
}
