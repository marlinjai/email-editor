'use client';

import { useState } from 'react';
import type { CompileMessage } from '@marlinjai/mail-contract';

/**
 * Rendered email HTML in a fully sandboxed frame: `sandbox=""` gives it no
 * scripts, no forms, no same-origin access and no top navigation, so markup
 * from a template, a recipient's merge values or an archived message can never
 * act on the dashboard. `srcDoc` keeps it off the network origin entirely.
 */
export function EmailFrame({ html, title, width = 'desktop' }: { html: string; title: string; width?: 'desktop' | 'mobile' }) {
  return (
    <div className="flex justify-center rounded-xl border border-line bg-[#f4f4f5] p-3">
      <iframe
        title={title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
        className="h-[70vh] w-full rounded-md bg-white transition-[max-width] duration-200 ease-[var(--ease-out)]"
        style={{ maxWidth: width === 'mobile' ? 390 : 760 }}
      />
    </div>
  );
}

export function DeviceToggle({ value, onChange }: { value: 'desktop' | 'mobile'; onChange: (v: 'desktop' | 'mobile') => void }) {
  return (
    <div role="group" aria-label="Preview width" className="inline-flex rounded-lg border border-line-strong p-0.5">
      {(['desktop', 'mobile'] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={`rounded-md px-2.5 py-1 text-[12.5px] transition-colors ${value === d ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}
        >
          {d === 'desktop' ? 'Desktop' : 'Mobile'}
        </button>
      ))}
    </div>
  );
}

/** MJML's errors and warnings for a compiled document. Errors block sending; warnings do not. */
export function CompileMessages({ errors, warnings }: { errors: CompileMessage[]; warnings: CompileMessage[] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 ? (
        <div role="alert" className="rounded-lg border border-[rgba(255,138,128,0.3)] bg-danger-wash px-3 py-2">
          <p className="text-[13px] font-medium text-danger">
            {errors.length === 1 ? 'One error' : `${errors.length} errors`}: this email cannot be sent until they are fixed.
          </p>
          <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink">
            {errors.map((m, i) => (
              <li key={i}>
                {m.message}
                {m.line ? <span className="text-muted"> (line {m.line})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <details className="rounded-lg border border-[rgba(240,192,90,0.22)] bg-warn-wash px-3 py-2">
          <summary className="cursor-pointer text-[13px] text-warn">
            {warnings.length === 1 ? 'One warning' : `${warnings.length} warnings`}
          </summary>
          <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink">
            {warnings.map((m, i) => (
              <li key={i}>{m.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** A preview with its own width toggle. */
export function EmailPreview({ html, title }: { html: string; title: string }) {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <DeviceToggle value={width} onChange={setWidth} />
      </div>
      <EmailFrame html={html} title={title} width={width} />
    </div>
  );
}
