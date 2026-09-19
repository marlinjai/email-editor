'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  HOSTED_PAGE_LOCALES,
  SIGNUP_FORM_FIELDS,
  type Provider,
  type SignupForm,
  type SignupFormEmbed,
  type Tag,
  type TemplateSummary,
  type Topic,
} from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Button, describedBy, Field, Input, Mono, Panel, Section, Select, Textarea } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { deleteSignupForm, saveSignupForm } from './actions';

export type FormLookups = { topics: Topic[]; tags: Tag[]; providers: Provider[]; templates: TemplateSummary[] };

const FIELD_LABELS: Record<(typeof SIGNUP_FORM_FIELDS)[number], string> = { first_name: 'First name', last_name: 'Last name' };
const LOCALE_NAMES: Record<(typeof HOSTED_PAGE_LOCALES)[number], string> = { en: 'English', de: 'German', it: 'Italian', fr: 'French', es: 'Spanish' };

/**
 * A snippet with a copy button that says whether the copy worked, out loud
 * too, and returns to "Copy" after a moment. Without a clipboard (an insecure
 * origin, an old browser) it says to select the text instead.
 */
function CopyBlock({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2_500);
    return () => clearTimeout(t);
  }, [state]);
  const copy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setState('failed');
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-muted">{label}</span>
        <Button variant="ghost" className="h-7 px-2 text-[12px]" onClick={copy}>
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed, select it instead' : 'Copy'}
        </Button>
      </div>
      {multiline ? (
        <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-black/40 p-3 font-mono text-[11.5px] whitespace-pre-wrap text-ink">{value}</pre>
      ) : (
        <code className="block rounded-lg border border-line bg-black/40 px-3 py-2 font-mono text-[12px] break-all text-ink">{value}</code>
      )}
      <span role="status" className="sr-only">
        {state === 'copied' ? `${label} copied` : state === 'failed' ? `${label} could not be copied; select the text and copy it` : ''}
      </span>
    </div>
  );
}

export function EmbedPanel({ embed }: { embed: SignupFormEmbed }) {
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <div>
        <p className="text-[13.5px] font-semibold text-ink">Put it on your site</p>
        <p className="mt-0.5 text-[12.5px] text-muted">Link to the hosted page, or paste the form into a page. The form works without JavaScript; the script adds a timing check and submits in place.</p>
      </div>
      <CopyBlock label="Hosted page" value={embed.hosted_url} />
      <a href={embed.hosted_url} target="_blank" rel="noreferrer" className="-mt-2 text-[12.5px] text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
        Open the hosted page
      </a>
      <CopyBlock label="Embed markup" value={embed.html} multiline />
      <CopyBlock label="Optional script" value={`<script src="${embed.script_url}" defer></script>`} />
    </Panel>
  );
}

export function SignupFormEditor({ ws, form, lookups, canAdmin }: { ws: string; form: SignupForm | null; lookups: FormLookups; canAdmin: boolean }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [name, setName] = useState(form?.name ?? '');
  const [title, setTitle] = useState(form?.title ?? '');
  const [consentText, setConsentText] = useState(form?.consent_text ?? '');
  const [topics, setTopics] = useState<string[]>(form?.topics ?? []);
  const [tags, setTags] = useState<string[]>(form?.tags ?? []);
  const [formFields, setFormFields] = useState<string[]>(form?.fields ?? ['first_name']);
  const [providerId, setProviderId] = useState(form?.provider_id ?? lookups.providers[0]?.id ?? '');
  const [templateId, setTemplateId] = useState(form?.confirmation_template_id ?? '');
  const [redirectUrl, setRedirectUrl] = useState(form?.redirect_url ?? '');
  const [originsText, setOriginsText] = useState((form?.allowed_origins ?? []).join('\n'));
  const [translations, setTranslations] = useState(() =>
    HOSTED_PAGE_LOCALES.map((locale) => ({
      locale,
      title: form?.translations[locale]?.title ?? '',
      consentText: form?.translations[locale]?.consent_text ?? '',
    })),
  );
  const [removing, setRemoving] = useState(false);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const origins = originsText
    .split(/[\s,]+/)
    .map((o) => o.trim())
    .filter(Boolean);
  const originError = Object.entries(fields).find(([k]) => k.startsWith('allowed_origins'))?.[1] ?? fields.allowedOrigins;
  const translationError = Object.entries(fields).find(([k]) => k.startsWith('translations'))?.[1];

  if (lookups.providers.length === 0) {
    return (
      <Panel className="p-5 text-[13px] text-muted">
        A signup form mails a confirmation link, so it needs a provider first. Add one under Settings, Providers.
      </Panel>
    );
  }

  return (
    <form
      className="flex max-w-[760px] flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            saveSignupForm(ws, form?.id ?? null, {
              name,
              title,
              consentText,
              translations,
              topics,
              tags,
              fields: formFields as Array<(typeof SIGNUP_FORM_FIELDS)[number]>,
              providerId,
              confirmationTemplateId: templateId,
              redirectUrl,
              allowedOrigins: origins,
            }),
          (saved) => (form ? router.refresh() : router.push(`/w/${ws}/contacts/forms/${saved.id}`)),
        );
      }}
    >
      <fieldset disabled={!canAdmin} className="contents">
        <Section title="The form">
          <div className="flex flex-col gap-4">
            <Field id="sf-name" label="Name" hint="Only you see this." error={fields.name}>
              <Input {...describedBy('sf-name', fields.name, true)} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </Field>
            <Field id="sf-title" label="Heading of the page" error={fields.title}>
              <Input {...describedBy('sf-title', fields.title)} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Stay in touch" />
            </Field>
            <Field id="sf-consent" label="What people agree to" hint="Shown above the button and recorded, word for word, with each confirmation." error={fields.consentText ?? fields.consent_text}>
              <Textarea
                {...describedBy('sf-consent', fields.consentText ?? fields.consent_text, true)}
                rows={3}
                value={consentText}
                onChange={(e) => setConsentText(e.target.value)}
                required
                maxLength={2000}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[12.5px] font-medium text-muted">Asked besides the email address</legend>
              {SIGNUP_FORM_FIELDS.map((f) => (
                <label key={f} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={formFields.includes(f)} onChange={() => toggle(formFields, setFormFields, f)} className="size-4 accent-[var(--gold)]" />
                  {FIELD_LABELS[f]}
                </label>
              ))}
            </fieldset>
          </div>
        </Section>

        <Section title="Who they become" description="Confirmed people are subscribed to these topics and get these tags.">
          <div className="grid gap-6 sm:grid-cols-2">
            <fieldset className="flex flex-col gap-2" aria-describedby={fields.topics ? 'sf-topics-error' : undefined}>
              <legend className="mb-1 text-[12.5px] font-medium text-muted">Topics</legend>
              {lookups.topics.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={topics.includes(t.slug)} onChange={() => toggle(topics, setTopics, t.slug)} className="size-4 accent-[var(--gold)]" />
                  {t.name} <Mono>{t.slug}</Mono>
                </label>
              ))}
              {lookups.topics.length === 0 ? <p className="text-[12.5px] text-faint">No topics yet. Add one under Settings, Topics.</p> : null}
              {fields.topics ? (
                <p id="sf-topics-error" className="text-[12px] text-danger">
                  {fields.topics}
                </p>
              ) : null}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[12.5px] font-medium text-muted">Tags</legend>
              {lookups.tags.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={tags.includes(t.slug)} onChange={() => toggle(tags, setTags, t.slug)} className="size-4 accent-[var(--gold)]" />
                  {t.name}
                </label>
              ))}
              {lookups.tags.length === 0 ? <p className="text-[12.5px] text-faint">No tags yet.</p> : null}
            </fieldset>
          </div>
        </Section>

        <Section title="Confirmation" description="The mail with the confirmation link, and where people land after following it.">
          <div className="flex flex-col gap-4">
            <Field id="sf-provider" label="Sent through" error={fields.providerId ?? fields.provider_id}>
              <Select {...describedBy('sf-provider', fields.providerId ?? fields.provider_id)} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                {lookups.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.from_email})
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="sf-template" label="Confirmation mail" hint="A template of your own must contain {{confirm_url}}." error={fields.confirmation_template_id}>
              <Select {...describedBy('sf-template', fields.confirmation_template_id, true)} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">The built-in mail, in the person&apos;s language</option>
                {lookups.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="sf-redirect" label="After confirming, go to (optional)" hint="Empty shows the hosted confirmation page." error={fields.redirectUrl ?? fields.redirect_url}>
              <Input
                {...describedBy('sf-redirect', fields.redirectUrl ?? fields.redirect_url, true)}
                type="url"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://example.com/thanks"
              />
            </Field>
            <Field id="sf-origins" label="Sites that embed the form (optional)" hint="One origin per line, such as https://example.com. Only these may show and submit the embedded form." error={originError}>
              <Textarea
                {...describedBy('sf-origins', originError, true)}
                rows={2}
                value={originsText}
                onChange={(e) => setOriginsText(e.target.value)}
                className="font-mono"
                spellCheck={false}
              />
            </Field>
          </div>
        </Section>

        <Section title="Languages" description="The hosted page follows the visitor's language. A language needs both texts; for one left empty, the page shows the texts above.">
          {translationError ? <p className="mb-2 text-[12px] text-danger">{translationError}</p> : null}
          <div className="flex flex-col gap-4">
            {translations.map((t, i) => (
              <fieldset key={t.locale} className="grid gap-2 sm:grid-cols-[88px_1fr]">
                <legend className="sr-only">{LOCALE_NAMES[t.locale]}</legend>
                <span className="pt-2 text-[12.5px] text-muted" aria-hidden="true">
                  {LOCALE_NAMES[t.locale]}
                </span>
                <div className="flex flex-col gap-2">
                  <Input
                    aria-label={`Heading in ${LOCALE_NAMES[t.locale]}`}
                    placeholder="Heading"
                    value={t.title}
                    onChange={(e) => setTranslations((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    maxLength={120}
                  />
                  <Textarea
                    aria-label={`What people agree to, in ${LOCALE_NAMES[t.locale]}`}
                    placeholder="What people agree to"
                    rows={2}
                    value={t.consentText}
                    onChange={(e) => setTranslations((xs) => xs.map((x, j) => (j === i ? { ...x, consentText: e.target.value } : x)))}
                    maxLength={2000}
                  />
                </div>
              </fieldset>
            ))}
          </div>
        </Section>
      </fieldset>
      <FormError error={error} />
      {canAdmin ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" variant="primary" busy={pending}>
            {form ? 'Save form' : 'Create form'}
          </Button>
          {form ? (
            <Button variant="ghost" onClick={() => setRemoving(true)}>
              Delete form
            </Button>
          ) : null}
          {form ? <span className="text-[12.5px] text-faint">Version {form.version}; each change is a new version, recorded with every confirmation.</span> : null}
        </div>
      ) : (
        <p className="text-[12.5px] text-faint">Only an admin or owner can change signup forms.</p>
      )}
      {form ? (
        <ConfirmDialog
          open={removing}
          onClose={() => setRemoving(false)}
          title={`Delete the form ${form.name}?`}
          description="The hosted page and every embed of it stop working at once. People who already confirmed stay subscribed; links in confirmation mails not yet followed stop working."
          confirmLabel="Delete form"
          action={() => deleteSignupForm(ws, form.id)}
          onDone={() => router.push(`/w/${ws}/contacts/forms`)}
        />
      ) : null}
    </form>
  );
}
