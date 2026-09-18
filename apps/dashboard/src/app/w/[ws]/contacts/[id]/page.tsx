import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, EmptyState, ErrorPanel, LinkButton, Mono, PageHeader, Panel, Section, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { EraseContact } from './erase';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const contact = await act('contacts.get', async () => (await mail(ws)).api.contacts.get(id));
  if (!contact.ok) {
    return (
      <ErrorPanel
        title="This contact could not be opened"
        message={contact.error.code === 'not_found' ? 'It no longer exists; it may have been erased.' : contact.error.message}
        requestId={contact.error.requestId}
        action={<LinkButton href={`/w/${ws}/contacts`}>Back to contacts</LinkButton>}
      />
    );
  }
  const c = contact.data;
  const [messages, suppressions] = await Promise.all([
    act('contacts.messages', async () => (await mail(ws)).api.contacts.messages(id, { limit: 50 })),
    act('suppressions.list', async () => (await (await mail(ws)).api.suppressions.list({ email: c.email, limit: 20 })).data),
  ]);
  const props = Object.entries(c.properties);
  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/contacts`} className="text-[12.5px] text-muted hover:text-ink">
          ← Contacts
        </Link>
      </div>
      <PageHeader
        title={c.email}
        description={[c.first_name, c.last_name].filter(Boolean).join(' ') || undefined}
        actions={can(role, 'write') ? <EraseContact ws={ws} contactId={c.id} email={c.email} /> : null}
      />
      <Panel className="grid gap-4 p-5 text-[13px] sm:grid-cols-4">
        <div>
          <p className="text-faint">External id</p>
          <p className="mt-1">{c.external_id ? <Mono>{c.external_id}</Mono> : <span className="text-faint">none</span>}</p>
        </div>
        <div>
          <p className="text-faint">Language</p>
          <p className="mt-1">{c.locale ?? <span className="text-faint">workspace default</span>}</p>
        </div>
        <div>
          <p className="text-faint">Subscribed to</p>
          <p className="mt-1 flex flex-wrap gap-1">{c.topics.length ? c.topics.map((t) => <Badge key={t}>{t}</Badge>) : <span className="text-faint">no topic</span>}</p>
        </div>
        <div>
          <p className="text-faint">Suppressed</p>
          <p className="mt-1 flex flex-wrap gap-1">
            {!suppressions.ok ? (
              <span className="text-warn">unknown</span>
            ) : suppressions.data.length === 0 ? (
              <span className="text-faint">no</span>
            ) : (
              suppressions.data.map((s) => (
                <Badge key={s.id} tone="warn">
                  {s.reason}
                  {s.topic ? ` (${s.topic})` : ''}
                </Badge>
              ))
            )}
          </p>
        </div>
        {props.length > 0 ? (
          <div className="sm:col-span-4">
            <p className="text-faint">Properties</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {props.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-[12px] text-muted">{k}</dt>
                  <dd className="font-mono text-[12px] break-all text-ink">{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Panel>
      <Section title="Messages">
        {!messages.ok ? (
          <ErrorPanel title="Messages could not be loaded" message={messages.error.message} requestId={messages.error.requestId} />
        ) : messages.data.data.length === 0 ? (
          <EmptyState title="Nothing sent to this contact yet" />
        ) : (
          <Table label="Messages sent to this contact">
            <thead>
              <tr>
                <Th>Subject</Th>
                <Th>Outcome</Th>
                <Th>Sent</Th>
              </tr>
            </thead>
            <tbody>
              {messages.data.data.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <Link href={`/w/${ws}/archive/${m.id}`} className="text-ink hover:text-gold">
                      {m.subject}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex gap-1">
                      <Badge tone={m.outcome === 'sent' ? 'ok' : 'danger'}>{m.outcome}</Badge>
                      {m.is_test ? <Badge tone="gold">test</Badge> : null}
                    </span>
                  </Td>
                  <Td>
                    <When at={m.created_at} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
