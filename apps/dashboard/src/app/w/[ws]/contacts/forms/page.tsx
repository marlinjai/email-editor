import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, EmptyState, ErrorPanel, LinkButton, PageHeader, Table, Td, Th, When } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Signup forms' };

export default async function SignupFormsPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const forms = await act('signupForms.list', async () => {
    const { api } = await mail(ws);
    const all = [];
    for await (const f of api.paginate('signupForms.list', { query: { limit: 100 } })) all.push(f);
    return all;
  });
  const base = `/w/${ws}/contacts/forms`;
  const isAdmin = can(role, 'admin');
  return (
    <>
      <PageHeader
        title="Signup forms"
        description="A hosted page, or a form embedded on your site, where people subscribe themselves. Nobody is subscribed until they follow the confirmation link mailed to them (double opt-in), and what they agreed to is recorded."
        actions={isAdmin ? <LinkButton href={`${base}/new`} variant="primary">New form</LinkButton> : null}
      />
      {!forms.ok ? (
        <ErrorPanel title="Signup forms could not be loaded" message={forms.error.message} requestId={forms.error.requestId} />
      ) : forms.data.length === 0 ? (
        <EmptyState title="No signup forms yet" action={isAdmin ? <LinkButton href={`${base}/new`}>Create a form</LinkButton> : null}>
          A form subscribes people to one or more topics and can tag them on the way in.
        </EmptyState>
      ) : (
        <Table label="Signup forms">
          <thead>
            <tr>
              <Th>Form</Th>
              <Th>Topics</Th>
              <Th>Changed</Th>
            </tr>
          </thead>
          <tbody>
            {forms.data.map((f) => (
              <tr key={f.id}>
                <Td>
                  <Link href={`${base}/${f.id}`} className="text-ink hover:text-gold">
                    {f.name}
                  </Link>
                  <span className="block text-[12px] text-muted">{f.title}</span>
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1">
                    {f.topics.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </span>
                </Td>
                <Td>
                  <When at={f.updated_at} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
