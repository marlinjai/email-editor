'use client';

import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useSaved } from '@/components/saved';
import { Button, describedBy, Field, Input, Mono, Select } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { updateGeneral } from './actions';

type General = { name: string; slug: string; locales: string[]; defaultLocale: string; trackingEnabled: boolean };

export function GeneralForm({ ws, initial, canEdit }: { ws: string; initial: General; canEdit: boolean }) {
  const { run, pending, error, fields } = useAction();
  const saved = useSaved();
  const [name, setName] = useState(initial.name);
  const [localesText, setLocalesText] = useState(initial.locales.join(', '));
  const [defaultLocale, setDefaultLocale] = useState(initial.defaultLocale);
  const [tracking, setTracking] = useState(initial.trackingEnabled);
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
        void run(() => updateGeneral(ws, { name, locales, defaultLocale, trackingEnabled: tracking }), saved.mark);
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
        <div className="flex items-start gap-3 rounded-xl border border-line bg-panel p-4">
          <input
            id="g-tracking"
            type="checkbox"
            checked={tracking}
            onChange={(e) => setTracking(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--gold)]"
            aria-describedby="g-tracking-hint"
          />
          <div>
            <label htmlFor="g-tracking" className="text-[13.5px] font-medium text-ink">
              Open and click tracking
            </label>
            <p id="g-tracking-hint" className="mt-0.5 text-[12.5px] text-muted">
              Off by default. Turn it on only if your privacy policy says you track opens and clicks; the setting applies once campaign
              analytics ship.
            </p>
          </div>
        </div>
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
