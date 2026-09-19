'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { EXPORT_WARNINGS_HEADER, EXPORT_WARNING_COUNT_HEADER, parseExportWarningsHeader, type CompileMessage, type ExportFormat } from '@marlinjai/mail-contract';
import { Dialog } from './dialog';
import { Button } from './ui';

const FORMATS: Array<{ format: ExportFormat; label: string }> = [
  { format: 'mjml', label: 'MJML (.mjml)' },
  { format: 'html', label: 'HTML (.html)' },
];

/** The file name from a Content-Disposition value (the UTF-8 form first). */
function filenameOf(disposition: string | null, fallback: string): string {
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition ?? '');
  if (extended) {
    try {
      return decodeURIComponent(extended[1]!.trim());
    } catch {
      // the plain form below
    }
  }
  return /filename\s*=\s*"([^"]+)"/i.exec(disposition ?? '')?.[1] ?? fallback;
}

/**
 * "Export": a menu with MJML and HTML. The file comes from the dashboard's own
 * route handler (`href` + `?format=`), which asks the mail service server-side,
 * so no credential ever reaches the browser. What would block sending the
 * content (the export never refuses) is shown after the download, in a dialog.
 */
export function ExportMenu({ href, note }: { href: string; note?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ filename: string; warnings: CompileMessage[]; count: number } | null>(null);
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!button.current?.parentElement?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const download = async (format: ExportFormat) => {
    setOpen(false);
    setError(null);
    setBusy(format);
    try {
      const sep = href.includes('?') ? '&' : '?';
      const res = await fetch(`${href}${sep}format=${format}`, { cache: 'no-store' });
      if (!res.ok) {
        let message = 'The export failed. Try again in a moment.';
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          // keep the general message
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const filename = filenameOf(res.headers.get('content-disposition'), `export.${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser the moment it needs to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const warnings = parseExportWarningsHeader(res.headers.get(EXPORT_WARNINGS_HEADER));
      const count = Number(res.headers.get(EXPORT_WARNING_COUNT_HEADER)) || warnings.length;
      if (count > 0) setReport({ filename, warnings, count });
    } catch {
      setError('The dashboard did not answer. Check the connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative inline-flex flex-col items-end">
      <Button
        ref={button}
        busy={busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {busy ? `Exporting ${busy.toUpperCase()}` : 'Export'}
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Export as"
          className="absolute top-full right-0 z-50 mt-1 min-w-[190px] rounded-xl border border-line-strong bg-panel p-1 shadow-[var(--shadow-pop)]"
          onKeyDown={(e) => {
            const i = items.current.findIndex((el) => el === document.activeElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + FORMATS.length) % FORMATS.length;
              items.current[next]?.focus();
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
        >
          {note ? <p className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-faint">{note}</p> : null}
          {FORMATS.map((f, i) => (
            <button
              key={f.format}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-white/[0.05] focus:bg-white/[0.07] focus:outline-none"
              onClick={() => void download(f.format)}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 max-w-[320px] text-right text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <Dialog
        open={report !== null}
        onClose={() => setReport(null)}
        title={`${report?.filename ?? 'The file'} is downloaded`}
        description={`${report?.count === 1 ? 'One thing' : `${report?.count ?? 0} things`} in it would stop this workspace from sending it as it is:`}
        width="max-w-[560px]"
        footer={
          <Button variant="primary" onClick={() => setReport(null)}>
            Got it
          </Button>
        }
      >
        <ul className="flex max-h-72 list-disc flex-col gap-1.5 overflow-auto pl-5 text-[12.5px] text-ink">
          {report?.warnings.map((w, i) => (
            <li key={i}>
              {w.message}
              {w.line ? <span className="text-muted"> (line {w.line})</span> : null}
            </li>
          ))}
        </ul>
        {report && report.count > report.warnings.length ? (
          <p className="text-[12.5px] text-muted">And {report.count - report.warnings.length} more.</p>
        ) : null}
      </Dialog>
    </div>
  );
}
