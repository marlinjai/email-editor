'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ICLOUD_SMTP_POLICY, type Provider, type ProviderUsage, type ProviderVerifyResult } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, EmptyState, Field, Input, Mono, Notice, Panel, Section, Select, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatCount, percent } from '@/lib/format';
import { deleteProvider, saveProvider, setProviderEventsSecret, verifyProvider, type ProviderFormInput } from '../actions';

type Item = { provider: Provider; usage: ProviderUsage | null };

type Draft = {
  kind: 'smtp' | 'resend';
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  host: string;
  port: string;
  security: 'tls' | 'starttls';
  username: string;
  secret: string;
  budget: string;
  interval: string;
  perMessage: string;
};

const EMPTY: Draft = {
  kind: 'smtp',
  name: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  host: '',
  port: '587',
  security: 'starttls',
  username: '',
  secret: '',
  budget: '1000',
  interval: '1000',
  perMessage: '1',
};

const PRESETS: Array<{ label: string; draft: Partial<Draft> }> = [
  {
    label: 'iCloud+ custom domain',
    draft: {
      kind: 'smtp',
      name: 'iCloud+',
      host: 'smtp.mail.me.com',
      port: '587',
      security: 'starttls',
      budget: String(ICLOUD_SMTP_POLICY.daily_recipient_budget),
      interval: String(ICLOUD_SMTP_POLICY.min_interval_ms),
      perMessage: String(ICLOUD_SMTP_POLICY.max_recipients_per_message),
    },
  },
  { label: 'Resend', draft: { kind: 'resend', name: 'Resend', budget: '3000', interval: '200', perMessage: '1' } },
  { label: 'Other SMTP', draft: { kind: 'smtp' } },
];

function toDraft(p: Provider): Draft {
  return {
    kind: p.kind,
    name: p.name,
    fromName: p.from_name,
    fromEmail: p.from_email,
    replyTo: p.reply_to ?? '',
    host: p.kind === 'smtp' ? p.config.host : '',
    port: p.kind === 'smtp' ? String(p.config.port) : '587',
    security: p.kind === 'smtp' ? p.config.security : 'starttls',
    username: p.kind === 'smtp' ? p.config.username : '',
    secret: '',
    budget: String(p.policy.daily_recipient_budget),
    interval: String(p.policy.min_interval_ms),
    perMessage: String(p.policy.max_recipients_per_message),
  };
}

function toInput(d: Draft): ProviderFormInput {
  const policy = {
    daily_recipient_budget: Number(d.budget),
    min_interval_ms: Number(d.interval),
    max_recipients_per_message: Number(d.perMessage),
  };
  const common = { name: d.name, fromName: d.fromName, fromEmail: d.fromEmail, replyTo: d.replyTo, secret: d.secret, policy };
  return d.kind === 'smtp'
    ? { kind: 'smtp', ...common, host: d.host, port: Number(d.port), security: d.security, username: d.username }
    : { kind: 'resend', ...common };
}

function ProviderForm({
  ws,
  provider,
  onDone,
  onCancel,
}: {
  ws: string;
  provider: Provider | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { run, pending, error, fields } = useAction();
  const [d, setD] = useState<Draft>(provider ? toDraft(provider) : EMPTY);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const f = (path: string) => fields[path];
  const idp = provider ? `p-${provider.id}` : 'p-new';

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveProvider(ws, provider?.id ?? null, toInput(d)), onDone);
      }}
    >
      {!provider ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Start from">
          {PRESETS.map((p) => (
            <Button key={p.label} type="button" onClick={() => setD({ ...EMPTY, ...p.draft })}>
              {p.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idp}-name`} label="Name" error={f('name')}>
          <Input {...describedBy(`${idp}-name`, f('name'))} value={d.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <Field id={`${idp}-kind`} label="Kind">
          <Select
            id={`${idp}-kind`}
            value={d.kind}
            disabled={provider !== null}
            onChange={(e) => set('kind', e.target.value as Draft['kind'])}
          >
            <option value="smtp">SMTP</option>
            <option value="resend">Resend</option>
          </Select>
        </Field>
        <Field id={`${idp}-fromname`} label="Sender name" error={f('fromName')}>
          <Input
            {...describedBy(`${idp}-fromname`, f('fromName'))}
            value={d.fromName}
            onChange={(e) => set('fromName', e.target.value)}
            required
          />
        </Field>
        <Field id={`${idp}-fromemail`} label="Sender address" error={f('fromEmail')}>
          <Input
            {...describedBy(`${idp}-fromemail`, f('fromEmail'))}
            type="email"
            value={d.fromEmail}
            onChange={(e) => set('fromEmail', e.target.value)}
            required
          />
        </Field>
        <Field id={`${idp}-replyto`} label="Reply-to (optional)" error={f('replyTo')}>
          <Input
            {...describedBy(`${idp}-replyto`, f('replyTo'))}
            type="email"
            value={d.replyTo}
            onChange={(e) => set('replyTo', e.target.value)}
          />
        </Field>
        {d.kind === 'smtp' ? (
          <>
            <Field id={`${idp}-host`} label="SMTP host" error={f('host')}>
              <Input
                {...describedBy(`${idp}-host`, f('host'))}
                value={d.host}
                onChange={(e) => set('host', e.target.value)}
                required
                spellCheck={false}
              />
            </Field>
            <Field id={`${idp}-port`} label="Port" error={f('port')}>
              <Input
                {...describedBy(`${idp}-port`, f('port'))}
                inputMode="numeric"
                value={d.port}
                onChange={(e) => set('port', e.target.value)}
                required
              />
            </Field>
            <Field
              id={`${idp}-security`}
              label="Encryption"
              hint="Always encrypted: TLS from the start (465) or upgraded with STARTTLS (587)."
            >
              <Select
                {...describedBy(`${idp}-security`, undefined, true)}
                value={d.security}
                onChange={(e) => set('security', e.target.value as Draft['security'])}
              >
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS</option>
              </Select>
            </Field>
            <Field id={`${idp}-user`} label="User name" error={f('username')}>
              <Input
                {...describedBy(`${idp}-user`, f('username'))}
                value={d.username}
                onChange={(e) => set('username', e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
          </>
        ) : null}
        <Field
          id={`${idp}-secret`}
          label={d.kind === 'smtp' ? 'Password' : 'API key'}
          hint={
            provider
              ? provider.has_secret
                ? 'Stored and never shown. Leave empty to keep it; type a new one to replace it.'
                : 'None stored yet.'
              : 'Stored encrypted and never shown again, not even to you.'
          }
          error={f('secret')}
        >
          <Input
            {...describedBy(`${idp}-secret`, f('secret'), true)}
            type="password"
            value={d.secret}
            onChange={(e) => set('secret', e.target.value)}
            autoComplete="new-password"
            placeholder={provider?.has_secret ? '••••••••' : ''}
          />
        </Field>
      </div>
      <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
        <legend className="px-1 text-[12.5px] font-medium text-muted">Sending limits</legend>
        <Field id={`${idp}-budget`} label="Recipients per 24 hours" error={f('policy.daily_recipient_budget')}>
          <Input
            {...describedBy(`${idp}-budget`, f('policy.daily_recipient_budget'))}
            inputMode="numeric"
            value={d.budget}
            onChange={(e) => set('budget', e.target.value)}
          />
        </Field>
        <Field id={`${idp}-interval`} label="Milliseconds between messages" error={f('policy.min_interval_ms')}>
          <Input
            {...describedBy(`${idp}-interval`, f('policy.min_interval_ms'))}
            inputMode="numeric"
            value={d.interval}
            onChange={(e) => set('interval', e.target.value)}
          />
        </Field>
        <Field id={`${idp}-per`} label="Recipients per message" error={f('policy.max_recipients_per_message')}>
          <Input
            {...describedBy(`${idp}-per`, f('policy.max_recipients_per_message'))}
            inputMode="numeric"
            value={d.perMessage}
            onChange={(e) => set('perMessage', e.target.value)}
          />
        </Field>
      </fieldset>
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={pending}>
          {provider ? 'Save provider' : 'Add provider'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function VerifyResult({ result }: { result: ProviderVerifyResult }) {
  if (result.ok) return <Notice tone="ok">Connected and authenticated. Nothing was sent.</Notice>;
  const [code] = (result.error ?? '').split(':');
  const hint: Record<string, string> = {
    auth_failed: 'The user name, password or API key was refused.',
    tls_failed: 'The encrypted connection failed. Check the port and the encryption setting.',
    host_unreachable: 'The host did not answer. Check the host name and port.',
    no_secret: 'No password or API key is stored. Edit the provider and add one.',
    provider_rejected: 'The provider refused the check.',
  };
  return (
    <Notice tone="danger">
      <span className="font-medium">{hint[code ?? ''] ?? 'The check failed.'}</span>
      {result.error ? <span className="mt-1 block font-mono text-[12px] text-muted">{result.error}</span> : null}
    </Notice>
  );
}

/**
 * How bounces and complaints reach the service for this provider. Hard bounces
 * the receiving server reports while the message is handed over are detected
 * for every kind; later ones only through Resend's events.
 */
function BounceHandling({ ws, provider: p, canAdmin }: { ws: string; provider: Provider; canAdmin: boolean }) {
  const router = useRouter();
  const save = useAction();
  const [secret, setSecret] = useState('');
  const [open, setOpen] = useState(false);
  const idp = `p-${p.id}-events`;

  if (p.kind === 'smtp') {
    return (
      <Notice tone="warn">
        <span className="font-medium">Only immediate bounces are detected.</span>
        <span className="mt-1 block text-[12.5px]">
          An address the receiving server rejects while the message is handed over is blocked automatically. Bounces that arrive
          later as an email in the sender&apos;s inbox{p.config.host === 'smtp.mail.me.com' ? ' (how iCloud+ reports almost all of them)' : ''}{' '}
          are not read, so they are not detected: remove those addresses by hand under Suppressions.
        </span>
      </Notice>
    );
  }

  const e = p.events;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">Bounces and spam complaints</span>
        <Badge tone={e.status === 'active' ? 'ok' : 'warn'}>
          {e.status === 'active' ? (e.source === 'manual' ? 'Receiving (secret added by hand)' : 'Receiving') : 'Not set up'}
        </Badge>
      </div>
      <p className="mt-1.5 text-[12.5px] text-muted">
        {e.status === 'active'
          ? 'Resend reports hard bounces and spam complaints here, and those addresses are blocked on every topic.'
          : 'Until this is set up, only bounces Resend refuses at once are noticed; later bounces and spam complaints are missed.'}
      </p>
      {e.status !== 'active' && e.error ? <p className="mt-1.5 text-[12.5px] text-warn">{e.error}</p> : null}
      {e.unmatched > 0 ? (
        <p className="mt-1.5 text-[12.5px] text-muted">
          {formatCount(e.unmatched)} {e.unmatched === 1 ? 'event' : 'events'} named an email this provider did not send through Lumitra
          Mail (another app on the same Resend account). Those are counted and never block anyone.
        </p>
      ) : null}
      {canAdmin && (e.status !== 'active' || open) ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[12.5px] text-muted">
            In Resend, add a webhook with this endpoint and the events <Mono>email.bounced</Mono> and <Mono>email.complained</Mono>, then paste
            its signing secret. Verify tries to add it automatically, which works with a full-access API key.
          </p>
          <Field id={`${idp}-url`} label="Endpoint URL">
            <Input id={`${idp}-url`} readOnly value={e.url} spellCheck={false} onFocus={(ev) => ev.currentTarget.select()} />
          </Field>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              void save.run(() => setProviderEventsSecret(ws, p.id, secret), () => {
                setSecret('');
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <Field id={`${idp}-secret`} label="Signing secret" error={save.fields.signing_secret} className="min-w-[260px] flex-1">
              <Input
                {...describedBy(`${idp}-secret`, save.fields.signing_secret)}
                type="password"
                value={secret}
                onChange={(ev) => setSecret(ev.target.value)}
                placeholder="whsec_..."
                autoComplete="off"
                spellCheck={false}
                required
              />
            </Field>
            <Button type="submit" variant="primary" busy={save.pending}>
              Save secret
            </Button>
            {open ? (
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            ) : null}
          </form>
          <FormError error={save.error && !save.error.fields ? save.error : null} />
        </div>
      ) : canAdmin ? (
        <Button variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
          Replace signing secret
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The bounce circuit breaker tripped on one of this provider's mailings: too
 * many recipients refused as dead addresses in one run, which points at the
 * provider or the sender's setup. The run's blocks were undone.
 */
function BreakerAnomaly({ ws, provider: p }: { ws: string; provider: Provider }) {
  const a = p.rejections.anomaly;
  if (!a) return null;
  return (
    <Notice tone="danger">
      <span className="font-medium">
        A mailing was paused <When at={a.at} />: too many recipients were refused as unknown addresses.
      </span>
      <span className="mt-1 block text-[12.5px]">
        {a.reason} The addresses were not blocked. Check this provider&apos;s account and the sender&apos;s domain setup, then resume
        the mailing{a.mailing_id ? (
          <>
            {' '}
            (<a className="underline" href={`/w/${ws}/mailings/${a.mailing_id}`}>open it</a>)
          </>
        ) : null}
        .
      </span>
      {a.sample ? <span className="mt-1 block font-mono text-[12px] text-muted">{a.sample}</span> : null}
    </Notice>
  );
}

/** Rejections the sender is at fault for (policy, relay, authentication), never a recipient's. */
function Rejections({ provider: p }: { provider: Provider }) {
  const r = p.rejections;
  if (r.count === 0) return null;
  return (
    <Notice tone="danger">
      <span className="font-medium">
        {formatCount(r.count)} {r.count === 1 ? 'message was' : 'messages were'} refused because of the sender, not the recipient
        {r.last_at ? (
          <>
            , last <When at={r.last_at} />
          </>
        ) : null}
        .
      </span>
      <span className="mt-1 block text-[12.5px]">
        Receiving servers or the provider rejected the sender (authentication, a blocklist, a content or rate policy). Recipients are not
        blocked for this; check the sender&apos;s domain setup and the provider account.
      </span>
      {r.last_error ? <span className="mt-1 block font-mono text-[12px] text-muted">{r.last_error}</span> : null}
    </Notice>
  );
}

function ProviderCard({ ws, item, canAdmin }: { ws: string; item: Item; canAdmin: boolean }) {
  const router = useRouter();
  const { provider: p, usage } = item;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const verify = useAction();
  const [verified, setVerified] = useState<ProviderVerifyResult | null>(null);
  const used = usage ? usage.recipients_last_24h : 0;
  const budget = p.policy.daily_recipient_budget;
  const pct = percent(used, budget);

  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{p.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {p.from_name} <Mono>&lt;{p.from_email}&gt;</Mono>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{p.kind === 'smtp' ? `SMTP ${p.config.host}:${p.config.port}` : 'Resend'}</Badge>
            <Badge tone={p.has_secret ? 'ok' : 'danger'}>{p.has_secret ? 'Credential stored' : 'No credential'}</Badge>
          </div>
        </div>
        {canAdmin && !editing ? (
          <div className="flex gap-2">
            <Button
              busy={verify.pending}
              onClick={() =>
                void verify.run(() => verifyProvider(ws, p.id), (result) => {
                  setVerified(result);
                  // A verify may also have registered the Resend events endpoint.
                  router.refresh();
                })
              }
            >
              Verify
            </Button>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="ghost" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted">Last 24 hours</span>
          <span className="tabular text-ink">
            {usage ? `${formatCount(used)} of ${formatCount(budget)} recipients` : 'Usage unavailable'}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
          role="img"
          aria-label={`${pct} percent of the daily budget used`}
        >
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-danger' : 'gold-surface border-0'}`} style={{ width: `${pct}%` }} />
        </div>
        {usage?.next_capacity_at ? (
          <p className="mt-1.5 text-[12.5px] text-warn">
            Budget used up. Sending resumes around <When at={usage.next_capacity_at} />.
          </p>
        ) : null}
      </div>
      <div aria-live="polite" className="mt-3 empty:hidden">
        {verify.error ? <FormError error={verify.error} /> : verified ? <VerifyResult result={verified} /> : null}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <BreakerAnomaly ws={ws} provider={p} />
        <Rejections provider={p} />
        <BounceHandling ws={ws} provider={p} canAdmin={canAdmin} />
      </div>
      {editing ? (
        <div className="mt-5 border-t border-line pt-5">
          <ProviderForm
            ws={ws}
            provider={p}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false);
              setVerified(null);
              router.refresh();
            }}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete "${p.name}"?`}
        description="Mailings that already used it keep their history. A mailing that is still sending, paused or scheduled with it has to finish or be cancelled first."
        confirmLabel="Delete provider"
        action={() => deleteProvider(ws, p.id)}
        onDone={() => router.refresh()}
      />
    </Panel>
  );
}

export function ProvidersView({ ws, items, canAdmin }: { ws: string; items: Item[]; canAdmin: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Section
        title="Sending providers"
        description="Where mail leaves from. The limits keep a mailing inside what the provider allows; the worker never sends faster or more."
        actions={
          canAdmin && !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add provider
            </Button>
          ) : null
        }
      >
        {adding ? (
          <Panel className="mb-4 p-5">
            <ProviderForm
              ws={ws}
              provider={null}
              onCancel={() => setAdding(false)}
              onDone={() => {
                setAdding(false);
                router.refresh();
              }}
            />
          </Panel>
        ) : null}
        {items.length === 0 && !adding ? (
          <EmptyState
            title="No provider yet"
            action={
              canAdmin ? (
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Add provider
                </Button>
              ) : null
            }
          >
            Connect the mailbox or service your mail is sent through: an iCloud+ custom domain, Resend, or any SMTP server.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ProviderCard key={item.provider.id} ws={ws} item={item} canAdmin={canAdmin} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
