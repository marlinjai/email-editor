import Link from 'next/link';
import type { Metadata } from 'next';
import { EmailPreview } from '@/components/email-preview';
import { Badge, ErrorPanel, LinkButton, Mono, PageHeader, Panel, When } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';

export const metadata: Metadata = { title: 'Sent message' };

/** One archived message, its final HTML shown in a fully sandboxed frame. */
export default async function MessagePage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const message = await act('messages.get', async () => (await mail(ws)).api.messages.get(id));
  if (!message.ok) {
    return (
      <ErrorPanel
        title="This message could not be opened"
        message={message.error.code === 'not_found' ? 'It no longer exists; the contact it was sent to may have been erased.' : message.error.message}
        requestId={message.error.requestId}
        action={<LinkButton href={`/w/${ws}/archive`}>Back to the archive</LinkButton>}
      />
    );
  }
  const m = message.data;
  return (
    <>
      <div className="mb-2">
        <Link href={`/w/${ws}/archive`} className="text-[12.5px] text-muted hover:text-ink">
          ← Sent archive
        </Link>
      </div>
      <PageHeader title={m.subject} description={`To ${m.to}`} />
      <Panel className="mb-6 grid gap-4 p-5 text-[13px] sm:grid-cols-4">
        <div>
          <p className="text-faint">Outcome</p>
          <p className="mt-1 flex gap-1">
            <Badge tone={m.outcome === 'sent' ? 'ok' : 'danger'}>{m.outcome}</Badge>
            {m.is_test ? <Badge tone="gold">test</Badge> : null}
          </p>
        </div>
        <div>
          <p className="text-faint">Sent</p>
          <p className="mt-1">
            <When at={m.created_at} />
          </p>
        </div>
        <div>
          <p className="text-faint">Provider message id</p>
          <p className="mt-1 break-all">{m.provider_message_id ? <Mono>{m.provider_message_id}</Mono> : <span className="text-faint">none</span>}</p>
        </div>
        <div>
          <p className="text-faint">From</p>
          <p className="mt-1 flex flex-col gap-0.5">
            {m.mailing_id ? (
              <Link href={`/w/${ws}/mailings/${m.mailing_id}`} className="underline decoration-line-strong hover:text-gold">
                Its mailing
              </Link>
            ) : null}
            {m.contact_id ? (
              <Link href={`/w/${ws}/contacts/${m.contact_id}`} className="underline decoration-line-strong hover:text-gold">
                The contact
              </Link>
            ) : null}
          </p>
        </div>
        {m.error ? (
          <div className="sm:col-span-4">
            <p className="text-faint">Error</p>
            <p className="mt-1 text-danger">{m.error}</p>
          </div>
        ) : null}
      </Panel>
      <EmailPreview html={m.html} title={`Message to ${m.to}`} />
    </>
  );
}
