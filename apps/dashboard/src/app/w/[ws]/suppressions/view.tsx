'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SUPPRESSION_REASONS, type Suppression, type SuppressionReason } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, EmptyState, Field, Input, LinkButton, Mono, Panel, Section, Select, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { addSuppression, removeSuppression } from '../audiences-actions';

const REASON_TONE: Record<Suppression['reason'], 'neutral' | 'warn' | 'danger'> = { unsubscribed: 'neutral', manual: 'neutral', bounced: 'warn', complained: 'danger' };
const REASON_LABEL: Record<SuppressionReason, string> = {
  unsubscribed: 'Unsubscribed',
  bounced: 'Hard bounce',
  complained: 'Spam complaint',
  manual: 'Blocked by hand',
};

/** The list URL for a search and a reason filter, dropping what is empty. */
function listHref(base: string, q: string, reason: SuppressionReason | '' | null, cursor?: string) {
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(reason ? { reason } : {}), ...(cursor ? { cursor } : {}) });
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function SuppressionsView({
  ws,
  items,
  nextCursor,
  query,
  reason,
  topics,
  canWrite,
  canAdmin,
}: {
  ws: string;
  items: Suppression[];
  nextCursor: string | null;
  query: string;
  reason: SuppressionReason | null;
  topics: Array<{ slug: string; name: string }>;
  canWrite: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<Suppression | null>(null);
  const [search, setSearch] = useState(query);
  const [filter, setFilter] = useState<SuppressionReason | ''>(reason ?? '');
  const base = `/w/${ws}/suppressions`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form
          role="search"
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(listHref(base, search.trim(), filter));
          }}
        >
          <Field id="sup-search" label="Find an address">
            <Input id="sup-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" placeholder="ana@example.com" />
          </Field>
          <Field id="sup-reason" label="Reason">
            <Select id="sup-reason" value={filter} onChange={(e) => setFilter(e.target.value as SuppressionReason | '')} className="w-48">
              <option value="">Every reason</option>
              {SUPPRESSION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Search</Button>
        </form>
        {canWrite && !adding ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            Block an address
          </Button>
        ) : null}
      </div>
      {adding ? (
        <Panel className="mb-4 p-5">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => addSuppression(ws, { email, reason: 'manual', topic, note }), () => {
                setAdding(false);
                setEmail('');
                setNote('');
                router.refresh();
              });
            }}
          >
            <Field id="sup-email" label="Address" error={fields.email} className="min-w-[240px] flex-1">
              <Input {...describedBy('sup-email', fields.email)} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field id="sup-topic" label="From" error={fields.topic} className="w-56">
              <Select {...describedBy('sup-topic', fields.topic)} value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">Every topic</option>
                {topics.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="sup-note" label="Note (optional)" className="min-w-[200px] flex-1">
              <Input id="sup-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Field>
            <Button type="submit" variant="primary" busy={pending}>
              Block
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </form>
          <div className="mt-3">
            <FormError error={error && !error.fields ? error : null} />
          </div>
        </Panel>
      ) : null}
      <Section
        title={
          query ? `Suppressions matching "${query}"${reason ? ` (${REASON_LABEL[reason].toLowerCase()})` : ''}` : reason ? REASON_LABEL[reason] : 'All suppressions'
        }
      >
        {items.length === 0 ? (
          <EmptyState title={query ? 'No suppression for that address' : reason ? `No ${REASON_LABEL[reason].toLowerCase()} blocks` : 'No suppressions yet'}>
            {query
              ? 'It can be mailed, unless the contact is not subscribed to the topic.'
              : 'Unsubscribes, hard bounces and spam complaints (with Resend) land here on their own.'}
          </EmptyState>
        ) : (
          <>
            <Table label="Suppressions">
              <thead>
                <tr>
                  <Th>Address</Th>
                  <Th>Reason</Th>
                  <Th>Topic</Th>
                  <Th>Since</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <span className="text-ink">{s.email}</span>
                      {s.note ? <span className="block text-[12px] text-muted">{s.note}</span> : null}
                    </Td>
                    <Td>
                      <Badge tone={REASON_TONE[s.reason]}>{REASON_LABEL[s.reason]}</Badge>
                    </Td>
                    <Td>{s.topic ? <Mono>{s.topic}</Mono> : <span className="text-muted">every topic</span>}</Td>
                    <Td>
                      <When at={s.created_at} />
                    </Td>
                    <Td className="text-right">
                      {canAdmin ? (
                        <Button variant="ghost" onClick={() => setRemoving(s)}>
                          Lift
                        </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {nextCursor ? (
              <div className="mt-3 flex justify-end">
                <LinkButton href={listHref(base, query, reason, nextCursor)}>More</LinkButton>
              </div>
            ) : null}
          </>
        )}
      </Section>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Lift the block on ${removing?.email ?? ''}?`}
        description={
          removing?.reason === 'unsubscribed' || removing?.reason === 'complained'
            ? 'This person unsubscribed or complained. Mailing them again without their fresh consent may breach privacy law and harms your sending reputation. Lift it only if they asked to be mailed again.'
            : removing?.reason === 'bounced'
              ? 'This address hard-bounced: the receiving server said it does not exist. Lift the block only if it was fixed; if it still bounces, the next mailing blocks it again.'
              : 'They can be mailed again from the next mailing on.'
        }
        confirmLabel="Lift block"
        confirmText={removing?.reason === 'unsubscribed' || removing?.reason === 'complained' ? removing.email : undefined}
        action={() => removeSuppression(ws, removing!.id)}
        onDone={() => router.refresh()}
      />
    </>
  );
}
