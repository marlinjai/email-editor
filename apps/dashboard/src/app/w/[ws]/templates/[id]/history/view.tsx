'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CompileResult } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { CompileMessages, EmailPreview } from '@/components/email-preview';
import { FormError } from '@/components/form-error';
import { Badge, Button, EmptyState, LinkButton, Panel, Spinner, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { compileVersion, restoreVersion } from '../../actions';

type Version = { version: number; createdBy: string | null; createdAt: string };

function who(createdBy: string | null): string {
  if (!createdBy) return 'unknown';
  if (createdBy.startsWith('api_key:')) return 'an API key';
  if (createdBy.startsWith('member:')) return 'a member';
  return createdBy;
}

export function HistoryView({
  ws,
  templateId,
  currentVersion,
  versions,
  nextCursor,
  canWrite,
}: {
  ws: string;
  templateId: string;
  currentVersion: number;
  versions: Version[];
  nextCursor: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<CompileResult | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const compile = useAction();

  if (versions.length === 0)
    return <EmptyState title="No saved versions">Versions appear here each time the template is saved.</EmptyState>;

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Panel>
        <ol aria-label="Versions">
          {versions.map((v) => (
            <li key={v.version} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-pressed={selected === v.version}
                onClick={() => {
                  setSelected(v.version);
                  setPreview(null);
                  void compile.run(() => compileVersion(ws, templateId, v.version), setPreview);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${selected === v.version ? 'bg-gold-wash' : 'hover:bg-white/[0.03]'}`}
              >
                <span className="tabular w-10 text-[13px] font-semibold text-ink">v{v.version}</span>
                <span className="min-w-0 flex-1 text-[12.5px]">
                  <When at={v.createdAt} />
                  <span className="block text-faint">by {who(v.createdBy)}</span>
                </span>
                {v.version === currentVersion ? <Badge tone="gold">Current</Badge> : null}
              </button>
            </li>
          ))}
        </ol>
        {nextCursor ? (
          <div className="border-t border-line p-3">
            <LinkButton href={`/w/${ws}/templates/${templateId}/history?cursor=${encodeURIComponent(nextCursor)}`} className="w-full">
              Older versions
            </LinkButton>
          </div>
        ) : null}
      </Panel>
      <div className="flex min-w-0 flex-col gap-3">
        {notice ? (
          <p aria-live="polite" className="rounded-lg border border-[rgba(95,217,163,0.22)] bg-ok-wash px-3 py-2 text-[13px] text-ok">
            {notice}
          </p>
        ) : null}
        {selected === null ? (
          <EmptyState title="Choose a version">Its preview appears here, compiled exactly as it was saved.</EmptyState>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">Version {selected}</h2>
              {canWrite && selected !== currentVersion ? (
                <Button variant="primary" onClick={() => setRestoring(selected)}>
                  Restore this version
                </Button>
              ) : null}
            </div>
            <FormError error={compile.error} />
            {compile.pending ? (
              <div role="status" className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner /> Compiling version {selected}
              </div>
            ) : preview ? (
              <>
                <CompileMessages errors={preview.errors} warnings={preview.warnings} />
                <EmailPreview html={preview.html} title={`Version ${selected}`} />
              </>
            ) : null}
          </>
        )}
      </div>
      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Restore version ${restoring ?? ''}?`}
        description={`Its content is saved as version ${currentVersion + 1}. The current version stays in the history.`}
        confirmLabel="Restore"
        tone="primary"
        action={async () => {
          const r = await restoreVersion(ws, templateId, restoring!, currentVersion);
          if (r.ok && r.data.kind === 'conflict') {
            return {
              ok: false,
              error: { code: 'conflict', message: 'Someone saved this template in the meantime. Reload the history and try again.' },
            };
          }
          if (r.ok && r.data.kind === 'saved') setNotice(`Restored as version ${r.data.template.version}.`);
          return r;
        }}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
