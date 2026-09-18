import type { Metadata } from 'next';
import { EmptyState, ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { MailingContentForm } from '../content-form';

export const metadata: Metadata = { title: 'New mailing' };

/** Everything a mailing needs to exist: a template to copy, a topic and a provider. */
export default async function NewMailingPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<{ template?: string }> }) {
  const { ws } = await params;
  const { template } = await searchParams;
  const data = await act('mailings.compose', async () => {
    const { api } = await mail(ws);
    const [templates, topics, providers] = await Promise.all([
      api.templates.list({ archived: 'false', limit: 100 }),
      api.topics.list({ limit: 100 }),
      api.providers.list({ limit: 100 }),
    ]);
    return { templates: templates.data, topics: topics.data, providers: providers.data };
  });
  const base = `/w/${ws}`;
  if (!data.ok) return <ErrorPanel title="The composer could not be loaded" message={data.error.message} requestId={data.error.requestId} />;
  const { templates, topics, providers } = data.data;
  const missing = [
    templates.length === 0 ? { label: 'a template', href: `${base}/templates` } : null,
    topics.length === 0 ? { label: 'a topic', href: `${base}/settings/topics` } : null,
    providers.length === 0 ? { label: 'a sending provider', href: `${base}/settings/providers` } : null,
  ].filter((x): x is { label: string; href: string } => x !== null);

  return (
    <>
      <PageHeader title="New mailing" description="The template's current version is copied into the mailing; later edits to the template do not change it." />
      {missing.length > 0 ? (
        <EmptyState
          title="Not ready yet"
          action={missing.map((m) => (
            <LinkButton key={m.href} href={m.href}>
              Create {m.label}
            </LinkButton>
          ))}
        >
          A mailing needs {missing.map((m) => m.label).join(', ')} first.
        </EmptyState>
      ) : (
        <MailingContentForm
          ws={ws}
          mode={{ kind: 'create', templates: templates.map((t) => ({ id: t.id, name: t.name })), templateId: templates.some((t) => t.id === template) ? template! : templates[0]!.id }}
          topics={topics.map((t) => ({ slug: t.slug, name: t.name }))}
          providers={providers.map((p) => ({ id: p.id, name: p.name, from: `${p.from_name} <${p.from_email}>` }))}
          initial={{ name: '', subject: '', preheader: '', topic: topics[0]!.slug, providerId: providers[0]!.id }}
        />
      )}
    </>
  );
}
