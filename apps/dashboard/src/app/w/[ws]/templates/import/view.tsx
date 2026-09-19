'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MJML_IMPORT_BYTES, type ImportWarning, type TemplateImportPreview, type TemplateImportResult } from '@marlinjai/mail-contract';
import { Dialog } from '@/components/dialog';
import { CompileMessages, DeviceToggle, EmailFrame } from '@/components/email-preview';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, Field, Input, Mono, Notice, Panel, Spinner, Textarea } from '@/components/ui';
import { useAction } from '@/components/use-action';
import {
  EMPTY_DRAFT,
  clearDraft,
  editSource,
  fingerprint,
  loadDraft,
  nameFromFile,
  saveDraft,
  sourceSize,
  withKey,
  type ImportDraft,
} from '@/lib/mjml-import';
import { importTemplate, previewImport } from '../actions';

type Preview = { source: string; data: TemplateImportPreview };

const session = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

const kb = (bytes: number) => `${(bytes / 1024).toLocaleString('en', { maximumFractionDigits: 1 })} KB`;

function WarningList({ title, tone, warnings, open }: { title: string; tone: 'warn' | 'neutral'; warnings: ImportWarning[]; open: boolean }) {
  if (warnings.length === 0) return null;
  return (
    <details open={open} className={`rounded-lg border px-3 py-2 ${tone === 'warn' ? 'border-[rgba(240,192,90,0.22)] bg-warn-wash' : 'border-line bg-panel-2'}`}>
      <summary className={`cursor-pointer text-[13px] font-medium ${tone === 'warn' ? 'text-warn' : 'text-muted'}`}>
        {title} ({warnings.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2.5">
        {warnings.map((w, i) => (
          <li key={i} className="text-[12.5px] text-ink">
            <p>{w.message}</p>
            <p className="mt-0.5 text-faint">
              <Mono>{w.path}</Mono>
              {w.line ? <span> · line {w.line}</span> : null}
            </p>
            {w.fragment ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-[12px] text-muted">Show the MJML</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-bg p-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-muted">
                  {w.fragment}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ImportView({ ws }: { ws: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ImportDraft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [fileError, setFileError] = useState<string | null>(null);
  const [created, setCreated] = useState<TemplateImportResult | null>(null);
  const previewing = useAction();
  const creating = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const autoPreviewed = useRef(false);

  const source = fingerprint(draft.mjml);
  // A preview is shown only for the source it was made from (backtrack: an edit discards it).
  const current = preview && preview.source === source ? preview.data : null;
  const size = sourceSize(draft.mjml);

  const runPreview = useCallback(
    (mjml: string) => {
      const from = fingerprint(mjml);
      void previewing.run(
        () => previewImport(ws, mjml),
        (data) => {
          setPreview({ source: from, data });
          setDraft((d) =>
            fingerprint(d.mjml) !== from
              ? d
              : {
                  ...d,
                  step: 'preview',
                  // First preview of this source: under service_only, offer to copy the images by default.
                  importRemoteAssets: d.key === null ? data.asset_policy === 'service_only' && data.remote_images.length > 0 : d.importRemoteAssets,
                },
          );
        },
      );
    },
    [previewing, ws],
  );

  // Resume: read the tab's draft once, and preview it again if it was on the preview step.
  useEffect(() => {
    const stored = loadDraft(session(), ws);
    setDraft(stored);
    setHydrated(true);
    if (stored.step === 'preview' && !autoPreviewed.current) {
      autoPreviewed.current = true;
      runPreview(stored.mjml);
    }
    // Once per mount: the stored draft is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  useEffect(() => {
    if (hydrated) saveDraft(session(), ws, draft);
  }, [draft, hydrated, ws]);

  const onFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!/\.(mjml|xml|txt)$/i.test(file.name) && file.type !== 'text/plain' && file.type !== 'application/xml') {
      setFileError('Choose an .mjml file (MJML is plain text).');
      return;
    }
    if (file.size > MAX_MJML_IMPORT_BYTES) {
      setFileError(`${file.name} is ${kb(file.size)}; the limit is ${kb(MAX_MJML_IMPORT_BYTES)}.`);
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileError(`${file.name} could not be read. Try again, or paste its content.`);
      return;
    }
    setDraft((d) => ({ ...editSource(d, text), name: d.name.trim() ? d.name : nameFromFile(file.name) }));
    if (fileInput.current) fileInput.current.value = '';
  };

  const create = () => {
    const keyed = withKey(draft, () => crypto.randomUUID());
    setDraft(keyed);
    void creating.run(
      () =>
        importTemplate(ws, {
          name: keyed.name,
          mjml: keyed.mjml,
          importRemoteAssets: keyed.importRemoteAssets,
          idempotencyKey: keyed.key!.value,
        }),
      (result) => {
        // Re-entry: the next import starts clean, with a new key.
        clearDraft(session(), ws);
        setDraft(EMPTY_DRAFT);
        setPreview(null);
        const notCopied = result.warnings.filter((w) => w.code === 'remote_image_not_imported');
        if (notCopied.length > 0) setCreated(result);
        else router.push(`/w/${ws}/templates/${result.template.id}`);
      },
    );
  };

  if (!hydrated) {
    return (
      <div role="status" className="flex items-center gap-2 text-[13px] text-muted">
        <Spinner /> Loading
      </div>
    );
  }

  const onPreviewStep = draft.step === 'preview';
  const warnings = current?.warnings.filter((w) => w.severity === 'warning') ?? [];
  const notes = current?.warnings.filter((w) => w.severity === 'info') ?? [];

  return (
    <div className="flex flex-col gap-5">
      <ol aria-label="Steps" className="flex gap-4 text-[12.5px]">
        <li aria-current={!onPreviewStep ? 'step' : undefined} className={!onPreviewStep ? 'font-medium text-ink' : 'text-muted'}>
          1. Paste or upload
        </li>
        <li aria-current={onPreviewStep ? 'step' : undefined} className={onPreviewStep ? 'font-medium text-ink' : 'text-muted'}>
          2. Check and create
        </li>
      </ol>

      {!onPreviewStep ? (
        <Panel className="flex flex-col gap-4 p-5">
          <Field id="import-name" label="Template name" error={creating.fields.name}>
            <Input
              {...describedBy('import-name', creating.fields.name)}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              maxLength={200}
              placeholder="Autumn newsletter"
            />
          </Field>
          <Field
            id="import-mjml"
            label="MJML"
            error={previewing.fields.mjml}
            hint={
              <span className={size.tooLarge ? 'text-danger' : undefined}>
                {kb(size.bytes)} of {kb(MAX_MJML_IMPORT_BYTES)}. The whole document, from &lt;mjml&gt; to &lt;/mjml&gt;.
                mj-include cannot be imported: paste the included MJML in its place.
              </span>
            }
          >
            <Textarea
              {...describedBy('import-mjml', previewing.fields.mjml, true)}
              value={draft.mjml}
              onChange={(e) => {
                setDraft((d) => editSource(d, e.target.value));
                previewing.clearError();
              }}
              rows={16}
              spellCheck={false}
              placeholder={'<mjml>\n  <mj-body>\n    ...\n  </mj-body>\n</mjml>'}
              className="font-mono text-[12.5px]"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".mjml,.xml,.txt,text/plain,application/xml"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <label htmlFor="import-file" className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-[13px] text-ink hover:border-[rgba(255,255,255,0.26)] focus-within:outline-2 focus-within:outline-gold">
              Upload a .mjml file
            </label>
            {fileError ? (
              <span role="alert" className="text-[12.5px] text-danger">
                {fileError}
              </span>
            ) : null}
            <span className="flex-1" />
            {current ? (
              <Button onClick={() => setDraft((d) => ({ ...d, step: 'preview' }))}>Back to the preview</Button>
            ) : null}
            <Button
              variant="primary"
              busy={previewing.pending}
              disabled={draft.mjml.trim() === '' || size.tooLarge}
              onClick={() => (current ? setDraft((d) => ({ ...d, step: 'preview' })) : runPreview(draft.mjml))}
            >
              Preview
            </Button>
          </div>
          <FormError error={previewing.error && !previewing.error.fields ? previewing.error : null} />
        </Panel>
      ) : !current ? (
        <Panel className="flex flex-col gap-3 p-5">
          {previewing.pending ? (
            <div role="status" className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner /> Reading the MJML
            </div>
          ) : (
            <>
              <FormError error={previewing.error} />
              <div className="flex gap-2">
                <Button onClick={() => setDraft((d) => ({ ...d, step: 'source' }))}>Back to the MJML</Button>
                <Button variant="primary" onClick={() => runPreview(draft.mjml)}>
                  Try again
                </Button>
              </div>
            </>
          )}
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-muted">How the mail will look, compiled exactly as a send would.</p>
              <DeviceToggle value={width} onChange={setWidth} />
            </div>
            <EmailFrame html={current.compiled.html} title="Preview of the imported MJML" width={width} />
          </div>
          <aside aria-label="What the import found" className="flex flex-col gap-3">
            <Field id="import-name-2" label="Template name" error={creating.fields.name}>
              <Input
                {...describedBy('import-name-2', creating.fields.name)}
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                maxLength={200}
              />
            </Field>
            {warnings.length === 0 && notes.length === 0 && current.compiled.errors.length === 0 ? (
              <Notice tone="ok">Everything became editable blocks. Nothing was left out.</Notice>
            ) : null}
            <CompileMessages errors={current.compiled.errors} warnings={current.compiled.warnings} />
            <WarningList title="Needs your attention" tone="warn" warnings={warnings} open />
            <WarningList title="Good to know" tone="neutral" warnings={notes} open={warnings.length === 0} />
            {current.remote_images.length > 0 ? (
              <Panel className="flex flex-col gap-2 p-3">
                <p className="text-[13px] font-medium text-ink">
                  Images from other servers <Badge tone={current.asset_policy === 'service_only' ? 'warn' : 'neutral'}>{current.remote_images.length}</Badge>
                </p>
                <p className="text-[12.5px] text-muted">
                  {current.asset_policy === 'service_only'
                    ? 'This workspace sends only images it hosts itself. Copy these into its images, or the mail cannot be sent.'
                    : 'Copying them into this workspace keeps the mail working if the other server removes them.'}
                </p>
                <ul className="max-h-40 overflow-auto text-[12px]">
                  {current.remote_images.map((r) => (
                    <li key={r.url} className="truncate text-faint" title={r.url}>
                      <Mono>{r.url}</Mono>
                    </li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={draft.importRemoteAssets}
                    onChange={(e) => setDraft((d) => ({ ...d, importRemoteAssets: e.target.checked }))}
                  />
                  Import images into assets
                </label>
              </Panel>
            ) : null}
            <FormError error={creating.error && !creating.error.fields ? creating.error : null} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setDraft((d) => ({ ...d, step: 'source' }))}>Back to the MJML</Button>
              <Button variant="primary" busy={creating.pending} onClick={create}>
                Create template
              </Button>
            </div>
          </aside>
        </div>
      )}

      <Dialog
        open={created !== null}
        onClose={() => created && router.push(`/w/${ws}/templates/${created.template.id}`)}
        title="Template created"
        description="Some images could not be copied into this workspace. They still load from their own servers; replace them in the editor if the workspace needs its own copies."
        width="max-w-[520px]"
        footer={
          <Button variant="primary" onClick={() => created && router.push(`/w/${ws}/templates/${created.template.id}`)}>
            Open in the editor
          </Button>
        }
      >
        <ul className="flex max-h-60 flex-col gap-1.5 overflow-auto text-[12.5px] text-ink">
          {created?.warnings
            .filter((w) => w.code === 'remote_image_not_imported')
            .map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
        {created && created.imported_assets.length > 0 ? (
          <p className="text-[12.5px] text-muted">{created.imported_assets.length} copied into the workspace&apos;s images.</p>
        ) : null}
      </Dialog>
    </div>
  );
}
