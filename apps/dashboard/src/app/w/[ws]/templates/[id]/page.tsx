import type { Metadata } from 'next';
import { EmailPreview, CompileMessages } from '@/components/email-preview';
import { ExportMenu } from '@/components/export-menu';
import { ErrorPanel, LinkButton, PageHeader } from '@/components/ui';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import { can } from '@/lib/roles';
import { workspaceContext } from '@/lib/workspace';
import { EditorScreen } from './editor-screen';

export const metadata: Metadata = { title: 'Template' };

export default async function TemplatePage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const { ws, id } = await params;
  const ctx = await workspaceContext(ws);
  const role = ctx.ok && ctx.data ? ctx.data.role : 'viewer';
  const template = await act('templates.get', async () => (await mail(ws)).api.templates.get(id));
  if (!template.ok) {
    return (
      <ErrorPanel
        title="This template could not be opened"
        message={template.error.message}
        requestId={template.error.requestId}
        action={<LinkButton href={`/w/${ws}/templates`}>Back to templates</LinkButton>}
      />
    );
  }
  if (can(role, 'write')) return <EditorScreen ws={ws} template={template.data} />;

  // A viewer reads the template as it would arrive, without the editor.
  const compiled = await act('templates.compile', async () => (await mail(ws)).api.templates.compile(id));
  return (
    <>
      <PageHeader
        title={template.data.name}
        description={`Version ${template.data.version}. Your role can read templates but not change them.`}
        actions={
          <div className="flex items-start gap-2">
            <LinkButton href={`/w/${ws}/templates/${id}/history`}>History</LinkButton>
            <ExportMenu href={`/w/${ws}/templates/${id}/export`} />
          </div>
        }
      />
      {compiled.ok ? (
        <div className="flex flex-col gap-3">
          <CompileMessages errors={compiled.data.errors} warnings={compiled.data.warnings} />
          <EmailPreview html={compiled.data.html} title={`Preview of ${template.data.name}`} />
        </div>
      ) : (
        <ErrorPanel title="The preview could not be built" message={compiled.error.message} requestId={compiled.error.requestId} />
      )}
    </>
  );
}
