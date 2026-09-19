'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnRequestImage, TemplateSnapshotIn, TemplateSnapshotOut } from '@marlinjai/email-editor/react';
import { missingRequiredMergeFields, type CompileResult, type Template } from '@marlinjai/mail-contract';
import '@marlinjai/email-editor/styles.css';
import { ConfirmDialog, Dialog } from '@/components/dialog';
import { CompileMessages, DeviceToggle, EmailFrame } from '@/components/email-preview';
import { ExportMenu } from '@/components/export-menu';
import { FormError } from '@/components/form-error';
import { IconClose } from '@/components/icons';
import { Badge, Button, Spinner } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { compileDocument, importAsset, reloadTemplate, saveTemplate } from '../actions';
import { offServiceAddresses } from '@/lib/asset-policy';
import { ImageDialog, type PendingImage } from './image-dialog';

// The editor is browser-only (drag and drop, rich text, MobX): it is loaded on
// the client only. Compilation happens in the mail service.
const EmailEditorReact = dynamic(() => import('@marlinjai/email-editor/react').then((m) => m.EmailEditorReact), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted" role="status">
      <Spinner /> Loading the editor
    </div>
  ),
});

const editorTheme = {
  colors: { primary: '#b8912f', primaryHover: '#9c7a24' },
  fonts: { body: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
};

/** The document as the service stores it: the editor's snapshot without its local id. */
function toDocument(snapshot: TemplateSnapshotOut | Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = snapshot as Record<string, unknown>;
  return rest;
}

function toEditorInput(template: Template): TemplateSnapshotIn {
  return { ...(template.document as object), id: template.id } as unknown as TemplateSnapshotIn;
}

type Conflict = { currentVersion: number | null };

/** The editor's store reports changes this long after the last edit (core RootStore's default `onChangeDebounce`). */
const EDITOR_CHANGE_DEBOUNCE_MS = 300;

export function EditorScreen({ ws, template: initial }: { ws: string; template: Template }) {
  const router = useRouter();
  const [template, setTemplate] = useState(initial);
  const [editorKey, setEditorKey] = useState(0);
  const [name, setName] = useState(initial.name);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<CompileResult | null>(null);
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [imageRequest, setImageRequest] = useState<PendingImage | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const save = useAction();
  const compile = useAction();
  const reload = useAction();
  const importing = useAction();
  const [importingUrl, setImportingUrl] = useState<string | null>(null);


  // The latest document the editor reported, and whether the person has touched
  // it yet: the editor may report its normalised snapshot once on mount, which
  // is the baseline, not a change.
  const latest = useRef<Record<string, unknown>>(toDocument(toEditorInput(initial) as unknown as Record<string, unknown>));
  const touched = useRef(false);
  const lastInteraction = useRef(0);

  const onChange = useCallback((snapshot: TemplateSnapshotOut) => {
    latest.current = toDocument(snapshot);
    if (touched.current) setDirty(true);
  }, []);

  const interacted = useCallback(() => {
    touched.current = true;
    lastInteraction.current = Date.now();
  }, []);

  /**
   * The editor reports changes debounced (300 ms), so the document it last
   * reported may be one edit behind. Before reading it, wait until that window
   * has passed since the last interaction; otherwise a quick save would store
   * the previous document and silently drop the edit just made.
   */
  const settled = useCallback(async () => {
    const wait = lastInteraction.current + EDITOR_CHANGE_DEBOUNCE_MS + 100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return latest.current;
  }, []);

  /**
   * Copies a remote image into the workspace's assets and points the document
   * at the copy: every occurrence of the old address is replaced, the editor is
   * reopened on the result, and the preview is compiled again.
   */
  const importIntoAssets = useCallback(
    async (url: string) => {
      setImportingUrl(url);
      const current = await settled();
      await importing.run(
        () => importAsset(ws, url),
        (asset) => {
          const replaced = JSON.parse(JSON.stringify(current).split(JSON.stringify(url).slice(1, -1)).join(JSON.stringify(asset.url).slice(1, -1)));
          latest.current = replaced;
          setTemplate((t) => ({ ...t, document: replaced as Template['document'] }));
          setEditorKey((k) => k + 1);
          touched.current = true;
          setDirty(true);
          void compile.run(() => compileDocument(ws, replaced), setPreview);
        },
      );
      setImportingUrl(null);
    },
    [importing, settled, ws, compile],
  );

  const doSave = useCallback(
    (baseVersion: number) =>
      void save.run(
        async () => saveTemplate(ws, template.id, { baseVersion, name: name.trim() || template.name, document: (await settled()) as never }),
        (outcome) => {
          if (outcome.kind === 'saved') {
            setTemplate(outcome.template);
            setDirty(false);
            setConflict(null);
            setSavedAt(Date.now());
            router.refresh();
          } else {
            setConflict({ currentVersion: outcome.currentVersion });
          }
        },
      ),
    [save, ws, template.id, template.name, name, router, settled],
  );

  const refreshPreview = useCallback(() => void compile.run(async () => compileDocument(ws, await settled()), setPreview), [compile, ws, settled]);

  // Cmd/Ctrl+S saves; the browser's own warning protects a tab closed with unsaved work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!save.pending) doSave(template.version);
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [dirty, doSave, save.pending, template.version]);

  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const onRequestImage = useCallback<OnRequestImage>(
    (request) =>
      new Promise((resolve) =>
        setImageRequest({
          request,
          resolve: (image) => {
            interacted();
            resolve(image);
          },
        }),
      ),
    [interacted],
  );

  const back = `/w/${ws}/templates`;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <Button variant="ghost" onClick={() => (dirty ? setLeaving(true) : router.push(back))} aria-label="Back to templates">
          <IconClose />
        </Button>
        <label className="sr-only" htmlFor="tpl-title">
          Template name
        </label>
        <input
          id="tpl-title"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          maxLength={200}
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-[15px] font-semibold text-ink hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none"
        />
        <Badge>v{template.version}</Badge>
        <span aria-live="polite" className="text-[12.5px]">
          {save.pending ? (
            <span className="text-muted">Saving</span>
          ) : dirty ? (
            <span className="text-warn">Unsaved changes</span>
          ) : savedAt ? (
            <span className="text-ok">Saved as v{template.version}</span>
          ) : null}
        </span>
        <Link
          href={`/w/${ws}/templates/${template.id}/history`}
          className="text-[13px] text-muted underline decoration-line-strong hover:text-ink"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              setLeaving(true);
            }
          }}
        >
          History
        </Link>
        <Button
          onClick={() => {
            setPreviewOpen((v) => !v);
            if (!previewOpen) refreshPreview();
          }}
          aria-expanded={previewOpen}
        >
          Preview
        </Button>
        <ExportMenu
          href={`/w/${ws}/templates/${template.id}/export`}
          note={dirty ? `Exports the saved v${template.version}. Save first to include your changes.` : `Exports v${template.version}.`}
        />
        <Button variant="primary" busy={save.pending} onClick={() => doSave(template.version)} title="Save (Cmd or Ctrl + S)" data-testid="save-template">
          Save
        </Button>
      </header>
      {save.error ? (
        <div className="border-b border-line px-4 py-2">
          <FormError error={save.error} />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div
          className="ee-host flex min-h-0 min-w-0 flex-1 flex-col"
          onPointerDownCapture={interacted}
          onKeyDownCapture={interacted}
        >
          <EmailEditorReact
            key={editorKey}
            initialTemplate={toEditorInput(template)}
            onChange={onChange}
            // No onSave: the header's Save and Cmd/Ctrl+S save here; passing it
            // would render the editor toolbar's own Save as a second button.
            onRequestImage={onRequestImage}
            theme={editorTheme}
          />
        </div>
        {previewOpen ? (
          <aside
            aria-label="Preview"
            className="flex w-[min(820px,55vw)] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold">Preview of the unsaved email</h2>
              <div className="flex items-center gap-2">
                <DeviceToggle value={width} onChange={setWidth} />
                <Button busy={compile.pending} onClick={refreshPreview}>
                  Refresh
                </Button>
              </div>
            </div>
            <FormError error={compile.error} />
            {preview ? (
              <>
                <CompileMessages errors={preview.errors} warnings={preview.warnings} />
                {offServiceAddresses(preview.errors).length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
                    <p className="text-[12.5px] text-muted">
                      This workspace sends only images hosted by Lumitra Mail. Import each one into the workspace; the template then uses the copy.
                    </p>
                    {offServiceAddresses(preview.errors).map((url) => (
                      <div key={url} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink" title={url}>
                          {url}
                        </span>
                        <Button busy={importingUrl === url} disabled={importingUrl !== null} onClick={() => void importIntoAssets(url)}>
                          Import into assets
                        </Button>
                      </div>
                    ))}
                    <FormError error={importing.error} />
                  </div>
                ) : null}
                {missingRequiredMergeFields(preview.html).length > 0 ? (
                  <p className="rounded-lg border border-[rgba(240,192,90,0.22)] bg-warn-wash px-3 py-2 text-[12.5px] text-warn">
                    No <span className="font-mono">{'{{unsubscribe_url}}'}</span> link yet. A mailing cannot be sent without one; add it to
                    the footer.
                  </p>
                ) : null}
                <EmailFrame html={preview.html} title="Email preview" width={width} />
              </>
            ) : compile.pending ? (
              <div role="status" className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner /> Compiling
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <ImageDialog ws={ws} pending={imageRequest} onDone={() => setImageRequest(null)} />

      <Dialog
        open={conflict !== null}
        onClose={() => setConflict(null)}
        title="Someone else saved this template"
        description={`While you were editing, a newer version${conflict?.currentVersion ? ` (v${conflict.currentVersion})` : ''} was saved. Choose which one to keep.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConflict(null)} disabled={save.pending || reload.pending}>
              Decide later
            </Button>
            <Button
              busy={reload.pending}
              onClick={() =>
                void reload.run(
                  () => reloadTemplate(ws, template.id),
                  (fresh) => {
                    setTemplate(fresh);
                    setName(fresh.name);
                    latest.current = toDocument(toEditorInput(fresh) as unknown as Record<string, unknown>);
                    touched.current = false;
                    setDirty(false);
                    setConflict(null);
                    setEditorKey((k) => k + 1);
                  },
                )
              }
            >
              Load their version
            </Button>
            <Button
              variant="primary"
              busy={save.pending}
              disabled={!conflict?.currentVersion}
              onClick={() => conflict?.currentVersion && doSave(conflict.currentVersion)}
            >
              Save mine over it
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          Loading theirs discards your unsaved changes. Saving yours keeps theirs in the history, where it can be restored.
        </p>
        <FormError error={reload.error} />
      </Dialog>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Leave without saving?"
        description="Your changes since the last save are lost."
        confirmLabel="Discard changes"
        action={async () => ({ ok: true, data: null })}
        onDone={() => {
          setDirty(false);
          router.push(back);
        }}
      />
    </div>
  );
}
