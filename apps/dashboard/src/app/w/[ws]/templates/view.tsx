'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TemplateSummary } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Button, describedBy, EmptyState, Field, Input, LinkButton, Panel, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { createTemplate, deleteTemplate, duplicateTemplate, setArchived } from './actions';

function NewTemplate({ ws, onCancel }: { ws: string; onCancel: () => void }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [name, setName] = useState('');
  return (
    <Panel className="mb-4 p-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () => createTemplate(ws, { name, description: '' }),
            (r) => router.push(`/w/${ws}/templates/${r.id}`),
          );
        }}
      >
        <Field id="tpl-name" label="Template name" error={fields.name} className="min-w-[260px] flex-1">
          <Input
            {...describedBy('tpl-name', fields.name)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            autoFocus
          />
        </Field>
        <Button type="submit" variant="primary" busy={pending}>
          Create and open editor
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </form>
      <div className="mt-3">
        <FormError error={error && !error.fields ? error : null} />
      </div>
    </Panel>
  );
}

function RowActions({ ws, t, canWrite }: { ws: string; t: TemplateSummary; canWrite: boolean }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [deleting, setDeleting] = useState(false);
  if (!canWrite) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        busy={pending}
        onClick={() =>
          void run(
            () => duplicateTemplate(ws, t.id),
            (r) => router.push(`/w/${ws}/templates/${r.id}`),
          )
        }
      >
        Duplicate
      </Button>
      <Button
        variant="ghost"
        onClick={() =>
          void run(
            () => setArchived(ws, t.id, t.version, !t.archived_at),
            () => router.refresh(),
          )
        }
      >
        {t.archived_at ? 'Unarchive' : 'Archive'}
      </Button>
      <Button variant="ghost" onClick={() => setDeleting(true)}>
        Delete
      </Button>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error.message}
        </span>
      ) : null}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete "${t.name}"?`}
        description="The template and its version history are deleted. Mailings made from it keep their own copy and are not affected."
        confirmLabel="Delete template"
        confirmText={t.name}
        action={() => deleteTemplate(ws, t.id)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

export function TemplatesView({
  ws,
  templates,
  nextCursor,
  archived,
  canWrite,
}: {
  ws: string;
  templates: TemplateSummary[];
  nextCursor: string | null;
  archived: boolean;
  canWrite: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const base = `/w/${ws}/templates`;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Template status" className="flex gap-1">
          <LinkButton href={base} variant={archived ? 'ghost' : 'secondary'} aria-current={!archived ? 'page' : undefined}>
            Active
          </LinkButton>
          <LinkButton
            href={`${base}?archived=true`}
            variant={archived ? 'secondary' : 'ghost'}
            aria-current={archived ? 'page' : undefined}
          >
            Archived
          </LinkButton>
        </nav>
        {canWrite && !creating ? (
          <div className="flex gap-2">
            <LinkButton href={`${base}/import`}>Import MJML</LinkButton>
            <Button variant="primary" onClick={() => setCreating(true)}>
              New template
            </Button>
          </div>
        ) : null}
      </div>
      {creating ? <NewTemplate ws={ws} onCancel={() => setCreating(false)} /> : null}
      {templates.length === 0 ? (
        <EmptyState
          title={archived ? 'No archived templates' : 'No templates yet'}
          action={
            canWrite && !archived && !creating ? (
              <div className="flex flex-wrap justify-center gap-2">
                <LinkButton href={`${base}/import`}>Import MJML</LinkButton>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  New template
                </Button>
              </div>
            ) : null
          }
        >
          {archived
            ? 'Archived templates are kept but hidden from the mailing composer.'
            : 'Design your first email in the editor: drag in sections, write, add images, preview on desktop and mobile. Or import one you already wrote in MJML.'}
        </EmptyState>
      ) : (
        <>
          <Table label="Templates">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Version</Th>
                <Th>Last saved</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <Td>
                    <Link href={`${base}/${t.id}`} className="font-medium text-ink hover:text-gold">
                      {t.name}
                    </Link>
                    {t.description ? <span className="block max-w-[56ch] truncate text-[12px] text-muted">{t.description}</span> : null}
                  </Td>
                  <Td className="tabular text-muted">v{t.version}</Td>
                  <Td>
                    <When at={t.updated_at} />
                  </Td>
                  <Td>
                    <RowActions ws={ws} t={t} canWrite={canWrite} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {nextCursor ? (
            <div className="mt-3 flex justify-end">
              <LinkButton href={`${base}?${new URLSearchParams({ ...(archived ? { archived: 'true' } : {}), cursor: nextCursor })}`}>
                More templates
              </LinkButton>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
