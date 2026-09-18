import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, LinkButton, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';

export const metadata: Metadata = { title: 'Contacts' };

/** The people the service knows: a minimal copy of what clients send, with their topic subscriptions. */
export default async function ContactsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const list = await act('contacts.list', async () => (await mail(ws)).api.contacts.list({ email: q, limit: 50, cursor: sp.cursor }));
  const base = `/w/${ws}/contacts`;
  return (
    <>
      <PageHeader
        title="Contacts"
        description="Created when your application sends them, or when a mailing adds an address. Your application stays the system of record for the person."
      />
      <form role="search" action={base} className="mb-4 flex items-end gap-2">
        <Field id="c-search" label="Find by address">
          <Input id="c-search" name="q" type="search" defaultValue={q ?? ''} className="w-72" placeholder="ana@example.com" />
        </Field>
        <Button type="submit">Search</Button>
      </form>
      {!list.ok ? (
        <ErrorPanel title="Contacts could not be loaded" message={list.error.message} requestId={list.error.requestId} />
      ) : list.data.data.length === 0 ? (
        <EmptyState title={q ? 'No contact with that address' : 'No contacts yet'}>
          {q ? 'Search matches the whole address.' : 'Contacts appear when your application upserts them through the API or when you add recipients to a mailing.'}
        </EmptyState>
      ) : (
        <>
          <Table label="Contacts">
            <thead>
              <tr>
                <Th>Contact</Th>
                <Th>Topics</Th>
                <Th>External id</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`${base}/${c.id}`} className="text-ink hover:text-gold">
                      {c.email}
                    </Link>
                    {c.first_name || c.last_name ? <span className="block text-[12px] text-muted">{[c.first_name, c.last_name].filter(Boolean).join(' ')}</span> : null}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {c.topics.length === 0 ? <span className="text-faint">none</span> : c.topics.map((t) => <Badge key={t}>{t}</Badge>)}
                    </span>
                  </Td>
                  <Td className="font-mono text-[12px] text-muted">{c.external_id ?? ''}</Td>
                  <Td>
                    <When at={c.updated_at} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.data.next_cursor ? (
            <div className="mt-3 flex justify-end">
              <LinkButton href={`${base}?${new URLSearchParams({ ...(q ? { q } : {}), cursor: list.data.next_cursor })}`}>More contacts</LinkButton>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
