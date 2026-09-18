'use client';

import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useSaved } from '@/components/saved';
import { Button, describedBy, Field, Input, Mono, Select } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { saveTracking, updateGeneral } from './actions';

type General = { name: string; slug: string; locales: string[]; defaultLocale: string; assetPolicy: 'any' | 'service_only' };

export function GeneralForm({ ws, initial, canEdit }: { ws: string; initial: General; canEdit: boolean }) {
  const { run, pending, error, fields } = useAction();
  const saved = useSaved();
  const [name, setName] = useState(initial.name);
  const [localesText, setLocalesText] = useState(initial.locales.join(', '));
  const [defaultLocale, setDefaultLocale] = useState(initial.defaultLocale);
  const [assetPolicy, setAssetPolicy] = useState(initial.assetPolicy);
  const locales = [
    ...new Set(
      localesText
        .split(/[\s,]+/)
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];

  return (
    <form
      className="flex max-w-[560px] flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateGeneral(ws, { name, locales, defaultLocale, assetPolicy }), saved.mark);
      }}
    >
      <fieldset disabled={!canEdit} className="contents">
        <Field id="g-name" label="Workspace name" error={fields.name}>
          <Input {...describedBy('g-name', fields.name)} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-muted">Slug</span>
          <Mono className="text-[13px]">{initial.slug}</Mono>
        </div>
        <Field
          id="g-locales"
          label="Languages of the unsubscribe page"
          hint="Language tags separated by commas, for example de, en, fr. Topics can be translated into each."
          error={fields.locales ?? fields['locales.0']}
        >
          <Input
            {...describedBy('g-locales', fields.locales, true)}
            value={localesText}
            onChange={(e) => setLocalesText(e.target.value)}
            spellCheck={false}
            className="font-mono"
          />
        </Field>
        <Field
          id="g-default"
          label="Default language"
          hint="Shown when a contact has no language of their own."
          error={fields.defaultLocale}
        >
          <Select
            {...describedBy('g-default', fields.defaultLocale, true)}
            value={defaultLocale}
            onChange={(e) => setDefaultLocale(e.target.value)}
          >
            {(locales.includes(defaultLocale) ? locales : [defaultLocale, ...locales]).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
          <legend className="px-1 text-[13.5px] font-medium text-ink">Images and fonts in mail</legend>
          {(
            [
              ['any', 'From anywhere', 'Images, stylesheets and web fonts load from wherever the template points.'],
              [
                'service_only',
                'Only from Lumitra Mail',
                'Mail may load images and fonts only from this service. Anything hosted elsewhere is a compile error, so the mail cannot be sent until it is uploaded or imported into the workspace, and Google Fonts are left out. No third party learns when a mail is opened.',
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex items-start gap-3">
              <input
                type="radio"
                name="asset-policy"
                value={value}
                checked={assetPolicy === value}
                onChange={() => setAssetPolicy(value)}
                className="mt-1 size-4 accent-[var(--gold)]"
              />
              <span>
                <span className="block text-[13.5px] text-ink">{label}</span>
                <span className="block text-[12.5px] text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </fieldset>
      <FormError error={error} />
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" busy={pending}>
            Save changes
          </Button>
          {saved.node}
        </div>
      ) : (
        <p className="text-[12.5px] text-faint">Only an admin or owner can change these settings.</p>
      )}
    </form>
  );
}

/**
 * Open and click tracking, saved on its own: it is a privacy decision with a
 * plan behind it (Free has no tracking), not one more field of the workspace.
 */
export function TrackingForm({ ws, initial, canEdit }: { ws: string; initial: { opens: boolean; clicks: boolean }; canEdit: boolean }) {
  const { run, pending, error } = useAction();
  const saved = useSaved();
  const [opens, setOpens] = useState(initial.opens);
  const [clicks, setClicks] = useState(initial.clicks);
  const changed = opens !== initial.opens || clicks !== initial.clicks;
  const box = (id: string, label: string, hint: string, checked: boolean, set: (v: boolean) => void) => (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => set(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--gold)]"
        aria-describedby={`${id}-hint`}
      />
      <div>
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-0.5 text-[12.5px] text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
  return (
    <form
      className="flex max-w-[560px] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => saveTracking(ws, { opens, clicks }), saved.mark);
      }}
    >
      <fieldset disabled={!canEdit} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
        <legend className="px-1 text-[13.5px] font-medium text-ink">Open and click tracking</legend>
        <p className="text-[12.5px] text-muted">
          Off by default. Turn it on only if your privacy policy says you track opens and clicks. A mailing keeps the tracking it started
          with.
        </p>
        {box('tr-opens', 'Track opens', 'A one-pixel image in each mail. Apple Mail Privacy Protection opens are counted apart.', opens, setOpens)}
        {box('tr-clicks', 'Track clicks', 'Links go through this service first, then on to where they point.', clicks, setClicks)}
      </fieldset>
      <FormError error={error} />
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" busy={pending} disabled={!changed}>
            Save tracking
          </Button>
          {saved.node}
        </div>
      ) : null}
    </form>
  );
}
