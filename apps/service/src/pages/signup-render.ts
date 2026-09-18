import type { PageLocale } from './i18n.js';
import { escapeHtml, hidden, languageSwitch, page } from './render.js';
import { SIGNUP_MESSAGES, type SignupMessageKey } from './signup-i18n.js';

/**
 * Server-rendered HTML for the hosted signup form (`/f/<id>`), its confirmation
 * pages (`/f/confirm/<token>`) and the built-in confirmation mail. The same
 * shell, stylesheet and Content-Security-Policy as the unsubscribe page: no
 * script, nothing loaded from anywhere. Every value from a workspace or a
 * person is escaped here.
 */

/** A translated string with its `{placeholders}` filled; template and values are both escaped. */
export function st(locale: PageLocale, key: SignupMessageKey, vars: Record<string, string> = {}): string {
  return escapeHtml(SIGNUP_MESSAGES[locale][key]).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? escapeHtml(vars[name]!) : whole,
  );
}

export type SignupField = 'first_name' | 'last_name';

export type SignupFormView = {
  locale: PageLocale;
  offered: readonly PageLocale[];
  /** `/f/<id>`: the form posts here and the language links point here. */
  path: string;
  workspaceName: string;
  title: string;
  consentText: string;
  fields: readonly SignupField[];
  values: { email?: string; first_name?: string; last_name?: string };
  formToken: string;
  /** The post had no valid time check (the static embed): ask for one more click. */
  prompt?: boolean;
  errors?: { email?: boolean; name?: boolean };
};

function textField(
  locale: PageLocale,
  name: 'email' | SignupField,
  label: string,
  value: string | undefined,
  opts: { type: 'email' | 'text'; required: boolean; autocomplete: string; error?: string },
): string {
  const id = `f-${name}`;
  const describedBy = opts.error ? ` aria-describedby="${id}-err" aria-invalid="true"` : '';
  return (
    '<div class="field">' +
    `<label for="${id}">${label}${opts.required ? '' : ` <span class="opt">(${st(locale, 'optional')})</span>`}</label>` +
    `<input id="${id}" name="${name}" type="${opts.type}" autocomplete="${opts.autocomplete}"` +
    ` maxlength="${name === 'email' ? 254 : 200}"${opts.required ? ' required' : ''}` +
    ` value="${escapeHtml(value ?? '')}"${describedBy}>` +
    (opts.error ? `<p class="field-error" id="${id}-err">${opts.error}</p>` : '') +
    '</div>'
  );
}

export function renderSignupForm(view: SignupFormView): string {
  const { locale } = view;
  const ws = { workspace: view.workspaceName };
  const notice = view.prompt
    ? `<div class="notice note" role="status"><p>${st(locale, 'prompt_confirm')}</p></div>`
    : '';
  const nameError = view.errors?.name ? st(locale, 'error_name') : undefined;
  const fields =
    textField(locale, 'email', st(locale, 'email_label'), view.values.email, {
      type: 'email',
      required: true,
      autocomplete: 'email',
      error: view.errors?.email ? st(locale, 'error_email') : undefined,
    }) +
    (view.fields.includes('first_name')
      ? textField(locale, 'first_name', st(locale, 'first_name_label'), view.values.first_name, {
          type: 'text',
          required: false,
          autocomplete: 'given-name',
          error: nameError,
        })
      : '') +
    (view.fields.includes('last_name')
      ? textField(locale, 'last_name', st(locale, 'last_name_label'), view.values.last_name, {
          type: 'text',
          required: false,
          autocomplete: 'family-name',
          error: nameError,
        })
      : '');
  // The honeypot: invisible and unreachable for people (off-screen, out of the
  // tab order, hidden from assistive technology), filled in by naive bots.
  const honeypot =
    '<div class="hp" aria-hidden="true">' +
    `<label for="f-website">${st(locale, 'honeypot_label')}</label>` +
    '<input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off" value="">' +
    '</div>';
  const body =
    '<div class="card">' +
    `<h1>${escapeHtml(view.title)}</h1>` +
    notice +
    `<p class="lead">${st(locale, 'form_lead', ws)}</p>` +
    `<form method="post" action="${escapeHtml(view.path)}" novalidate>` +
    fields +
    honeypot +
    hidden('form_token', view.formToken) +
    hidden('lang', locale) +
    `<p class="consent">${escapeHtml(view.consentText)}</p>` +
    `<p class="consent">${st(locale, 'double_opt_in_note')}</p>` +
    `<button type="submit" class="primary">${st(locale, 'submit_button')}</button>` +
    '</form>' +
    '</div>' +
    languageSwitch(locale, view.offered, view.path) +
    `<footer><p>${st(locale, 'footer', ws)}</p></footer>`;
  return page(locale, st(locale, 'doc_title', { title: view.title, workspace: view.workspaceName }), body);
}

export type SignupMessageKind =
  | 'check'
  | 'confirm'
  | 'confirmed'
  | 'already'
  | 'expired'
  | 'superseded'
  | 'gone'
  | 'invalid'
  | 'rate'
  | 'error';

export type SignupMessageView = {
  kind: SignupMessageKind;
  locale: PageLocale;
  offered: readonly PageLocale[];
  /** The page's own path, for the language links; null for pages that name nothing. */
  path: string | null;
  /** Null on pages that must not say whose they are (an unusable link, our failure). */
  workspaceName: string | null;
  /** `check`: the address as typed, so the person sees where to look. */
  email?: string;
  /** `confirm`: the path the confirm button posts to. */
  confirmPath?: string;
  /** `expired`: the form to sign up again on. */
  formPath?: string;
  /** `confirmed`: some topics stayed paused by the sender. */
  paused?: boolean;
};

const TITLES: Record<SignupMessageKind, SignupMessageKey> = {
  check: 'check_title',
  confirm: 'confirm_title',
  confirmed: 'confirmed_title',
  already: 'already_title',
  expired: 'expired_title',
  superseded: 'superseded_title',
  gone: 'gone_title',
  invalid: 'invalid_title',
  rate: 'rate_title',
  error: 'error_title',
};

export function renderSignupMessage(view: SignupMessageView): string {
  const { locale, kind } = view;
  const ws = { workspace: view.workspaceName ?? '' };
  let content: string;
  switch (kind) {
    case 'check':
      content =
        `<p class="lead">${st(locale, 'check_text', { ...ws, email: view.email ?? '' })}</p>` +
        `<p class="consent">${st(locale, 'check_hint')}</p>`;
      break;
    case 'confirm':
      content =
        `<p class="lead">${st(locale, 'confirm_text', ws)}</p>` +
        `<form method="post" action="${escapeHtml(view.confirmPath ?? '')}">` +
        hidden('lang', locale) +
        `<button type="submit" class="primary">${st(locale, 'confirm_button')}</button></form>`;
      break;
    case 'confirmed':
      content =
        `<div class="notice" role="status"><p>${st(locale, 'confirmed_text', ws)}</p></div>` +
        (view.paused ? `<p>${st(locale, 'confirmed_paused')}</p>` : '');
      break;
    case 'expired':
      content =
        `<p class="lead">${st(locale, 'expired_text')}</p>` +
        (view.formPath ? `<p><a href="${escapeHtml(view.formPath)}">${st(locale, 'expired_link')}</a></p>` : '');
      break;
    default: {
      const text = `${kind}_text` as SignupMessageKey;
      content = `<p class="lead">${st(locale, text)}</p>`;
    }
  }
  const title = st(locale, TITLES[kind]);
  const body =
    '<div class="card">' +
    `<h1>${title}</h1>` +
    content +
    '</div>' +
    languageSwitch(locale, view.offered, view.path) +
    (view.workspaceName ? `<footer><p>${st(locale, 'footer', ws)}</p></footer>` : '');
  return page(locale, title, body);
}

/**
 * The built-in confirmation mail: localised, one heading, one button, the link
 * written out as a fallback, and the reassurance that ignoring it is safe.
 * Table-based with inline styles, the form mail clients render.
 */
export function renderConfirmationMail(input: { locale: PageLocale; workspaceName: string; confirmUrl: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { locale, confirmUrl } = input;
  const ws = { workspace: input.workspaceName };
  const raw = (key: SignupMessageKey, vars: Record<string, string> = {}) =>
    SIGNUP_MESSAGES[locale][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name]! : whole));
  const url = escapeHtml(confirmUrl);
  const html =
    '<!doctype html>' +
    `<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${st(locale, 'mail_heading')}</title></head>` +
    '<body style="margin:0;padding:0;background:#f5f4f1;color:#1f1e1c;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f1"><tr><td align="center" style="padding:32px 16px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d6d3cc;border-radius:12px">' +
    '<tr><td style="padding:32px 28px">' +
    `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${st(locale, 'mail_heading')}</h1>` +
    `<p style="margin:0 0 24px;font-size:16px;line-height:1.55">${st(locale, 'mail_text', ws)}</p>` +
    `<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#1f1e1c;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600">${st(locale, 'mail_button')}</a></p>` +
    `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#57554f">${st(locale, 'mail_ignore')}</p>` +
    `<p style="margin:0;font-size:14px;line-height:1.5;color:#57554f;word-break:break-all">${st(locale, 'mail_link_fallback', { url: confirmUrl })}</p>` +
    '</td></tr></table></td></tr></table></body></html>';
  const text = [raw('mail_heading'), '', raw('mail_text', ws), '', confirmUrl, '', raw('mail_ignore')].join('\n');
  return { subject: raw('mail_subject', ws), html, text };
}
