import { createHash } from 'node:crypto';
import { MESSAGES, type MessageKey, type PageLocale } from './i18n.js';

/**
 * Server-rendered HTML for the hosted unsubscribe page. No JavaScript, no
 * external request of any kind (fonts, images, scripts), one inline stylesheet
 * allowed by its hash in the Content-Security-Policy. Every value that comes from
 * a workspace or a contact (names, topic names, the address) is escaped here, in
 * one place, before it reaches the markup.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A translated string with its `{placeholders}` filled; template and values are both escaped. */
export function t(locale: PageLocale, key: MessageKey, vars: Record<string, string> = {}): string {
  return escapeHtml(MESSAGES[locale][key]).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? escapeHtml(vars[name]!) : whole,
  );
}

/**
 * Shows enough of the address for the person to recognise it and not enough for
 * a forwarded link or a screenshot to disclose it: "marlin@gmail.com" becomes
 * "m•••n@g•••.com".
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0]}•••` : `${local[0]}•••${local[local.length - 1]}`;
  const dot = domain.lastIndexOf('.');
  const maskedDomain = dot > 0 ? `${domain[0]}•••${domain.slice(dot)}` : `${domain[0] ?? ''}•••`;
  return `${maskedLocal}@${maskedDomain}`;
}

// Calm and neutral, since the page speaks for every workspace: warm greys, one
// ink colour for the primary action, system fonts. All text pairs meet WCAG 2.2
// AA contrast (4.5:1 for body text, 3:1 for the focus ring and control borders)
// in both schemes.
const CSS = `
:root{color-scheme:light dark;--bg:#f5f4f1;--surface:#fff;--text:#1f1e1c;--muted:#57554f;--line:#d6d3cc;--ink:#1f1e1c;--on-ink:#fff;--ok-bg:#eef5ef;--ok-line:#8fb597;--note-bg:#f3efe4;--note-line:#bfae7f;--focus:#2455c3}
@media (prefers-color-scheme:dark){:root{--bg:#171715;--surface:#22211f;--text:#eeece8;--muted:#b3b0a8;--line:#4a4843;--ink:#eeece8;--on-ink:#171715;--ok-bg:#1f2b21;--ok-line:#5d8a66;--note-bg:#2b2719;--note-line:#8a7a4c;--focus:#8fb1ff}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:1rem/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:34rem;margin:0 auto;padding:clamp(1.5rem,6vw,4rem) 1rem 3rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:clamp(1.25rem,5vw,2rem)}
.sender{margin:0 0 .25rem;color:var(--muted);font-size:.875rem;font-weight:600;letter-spacing:.02em;overflow-wrap:anywhere}
h1{margin:0 0 .5rem;font-size:clamp(1.5rem,5vw,1.875rem);line-height:1.2;font-weight:650;letter-spacing:-.01em}
h2{margin:0 0 .75rem;font-size:1.0625rem;line-height:1.3;font-weight:650}
p{margin:0 0 1rem}
.lead{color:var(--muted)}
.address{font-variant-numeric:tabular-nums;color:var(--muted);font-size:.9375rem}
section{margin-top:1.75rem;padding-top:1.5rem;border-top:1px solid var(--line)}
.notice{margin:0 0 1.25rem;padding:.875rem 1rem;border-radius:10px;border:1px solid var(--ok-line);background:var(--ok-bg)}
.notice.note{border-color:var(--note-line);background:var(--note-bg)}
.notice p{margin:0}
.notice p+p,.notice p+form{margin-top:.5rem}
ul{list-style:none;margin:0;padding:0}
li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem 1rem;padding:.875rem 0;border-bottom:1px solid var(--line)}
li:last-child{border-bottom:0}
.topic{flex:1 1 14rem;min-width:0}
.topic-name{display:block;font-weight:600;overflow-wrap:anywhere}
.topic-desc{display:block;color:var(--muted);font-size:.9375rem;overflow-wrap:anywhere}
.state{display:block;margin-top:.125rem;font-size:.875rem;color:var(--muted)}
form{margin:0}
button{font:inherit;font-weight:600;min-height:44px;padding:.625rem 1.125rem;border-radius:10px;cursor:pointer;border:1px solid var(--ink);background:transparent;color:var(--text);max-width:100%;overflow-wrap:anywhere}
button.primary{background:var(--ink);color:var(--on-ink)}
button:hover{box-shadow:inset 0 0 0 1px var(--ink)}
button:focus-visible,a:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.link-button{border:0;padding:.5rem 0;min-height:44px;text-decoration:underline;text-underline-offset:3px;font-weight:600;box-shadow:none}
.link-button:hover{box-shadow:none;text-decoration-thickness:2px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
nav{margin-top:1.5rem;font-size:.9375rem}
nav h2{display:inline;font-size:inherit;font-weight:400;color:var(--muted);margin:0 .5rem 0 0}
nav ul{display:inline-flex;flex-wrap:wrap;gap:.25rem .75rem}
nav li{display:inline;padding:0;border:0}
nav a{display:inline-block;padding:.5rem .125rem;min-height:44px;line-height:1.75;color:var(--text);text-underline-offset:3px}
nav a[aria-current]{font-weight:650;text-decoration:none}
footer{margin-top:1.25rem;color:var(--muted);font-size:.8125rem}
@media (forced-colors:active){button{border:1px solid ButtonText}.notice{border:1px solid CanvasText}}
`
  .replace(/\n/g, '')
  .trim();

const STYLE_HASH = createHash('sha256').update(CSS).digest('base64');

/**
 * Nothing loads from anywhere: no scripts, images, fonts or frames. Forms may
 * post only back to this page, the page cannot be framed (clickjacking the
 * unsubscribe button), and `<base>` cannot redirect relative URLs.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `style-src 'sha256-${STYLE_HASH}'`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export type TopicState = 'subscribed' | 'not_subscribed' | 'unsubscribed' | 'paused';

export type TopicView = { id: string; name: string; description: string | null; state: TopicState };

/** Whether every topic is blocked, and if so whether the person may lift it here. */
export type AllState = 'open' | 'unsubscribed' | 'paused';

export type Outcome =
  | { kind: 'unsubscribed' | 'resubscribed'; topic: TopicView | null }
  | { kind: 'test' };

export type PreferencesView = {
  locale: PageLocale;
  offered: readonly PageLocale[];
  /** The path of this page, `/u/<token>`; forms post to it and the language links point at it. */
  path: string;
  workspaceName: string;
  /** Null on a test send's preview, which has no contact. */
  maskedEmail: string | null;
  /** The topic of the mail the link came from, if it names one. */
  mailTopic: TopicView | null;
  topics: TopicView[];
  all: AllState;
  isTest: boolean;
  outcome?: Outcome;
};

function page(locale: PageLocale, title: string, body: string): string {
  return (
    '<!doctype html>' +
    `<html lang="${locale}"><head>` +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    '<meta name="referrer" content="no-referrer">' +
    `<title>${title}</title>` +
    `<style>${CSS}</style>` +
    `</head><body><main>${body}</main></body></html>`
  );
}

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

function actionForm(
  view: Pick<PreferencesView, 'path' | 'locale'>,
  fields: { action: 'unsubscribe' | 'resubscribe'; scope: 'topic' | 'all'; topicId?: string },
  button: string,
  className = '',
): string {
  return (
    `<form method="post" action="${escapeHtml(view.path)}">` +
    hidden('action', fields.action) +
    hidden('scope', fields.scope) +
    (fields.topicId ? hidden('topic', fields.topicId) : '') +
    hidden('lang', view.locale) +
    `<button type="submit"${className ? ` class="${className}"` : ''}>${button}</button>` +
    '</form>'
  );
}

function languageSwitch(locale: PageLocale, offered: readonly PageLocale[], path: string | null): string {
  if (offered.length < 2) return '';
  const items = offered
    .map((l) => {
      const name = escapeHtml(MESSAGES[l].lang_name);
      if (l === locale) return `<li><a aria-current="true" lang="${l}" hreflang="${l}">${name}</a></li>`;
      const href = path ? `${escapeHtml(path)}?lang=${l}` : `?lang=${l}`;
      return `<li><a href="${href}" lang="${l}" hreflang="${l}">${name}</a></li>`;
    })
    .join('');
  return `<nav aria-labelledby="lang-h"><h2 id="lang-h">${t(locale, 'language_label')}</h2><ul>${items}</ul></nav>`;
}

function stateLabel(locale: PageLocale, state: TopicState): string {
  const key = ({
    subscribed: 'state_subscribed',
    not_subscribed: 'state_not_subscribed',
    unsubscribed: 'state_unsubscribed',
    paused: 'state_paused',
  } as const)[state];
  return t(locale, key);
}

function topicRow(view: PreferencesView, topic: TopicView): string {
  const { locale } = view;
  const name = { topic: topic.name };
  let control = '';
  if (topic.state === 'unsubscribed') {
    control = actionForm(
      view,
      { action: 'resubscribe', scope: 'topic', topicId: topic.id },
      `${t(locale, 'action_resubscribe')}<span class="sr"> ${t(locale, 'action_to_topic', name)}</span>`,
    );
  } else if (topic.state !== 'paused' && view.all === 'open') {
    control = actionForm(
      view,
      { action: 'unsubscribe', scope: 'topic', topicId: topic.id },
      `${t(locale, 'action_unsubscribe')}<span class="sr"> ${t(locale, 'action_for_topic', name)}</span>`,
    );
  }
  return (
    '<li><div class="topic">' +
    `<span class="topic-name">${escapeHtml(topic.name)}</span>` +
    (topic.description ? `<span class="topic-desc">${escapeHtml(topic.description)}</span>` : '') +
    `<span class="state">${stateLabel(locale, topic.state)}</span>` +
    `</div>${control}</li>`
  );
}

function outcomeNotice(view: PreferencesView): string {
  const { locale, outcome } = view;
  if (!outcome) return '';
  if (outcome.kind === 'test') {
    return `<div class="notice note" role="status"><p>${t(locale, 'test_done')}</p></div>`;
  }
  const ws = { workspace: view.workspaceName };
  const text =
    outcome.kind === 'unsubscribed'
      ? outcome.topic
        ? t(locale, 'done_unsubscribed_topic', { ...ws, topic: outcome.topic.name })
        : t(locale, 'done_unsubscribed_all', ws)
      : outcome.topic
        ? t(locale, 'done_resubscribed_topic', { ...ws, topic: outcome.topic.name })
        : t(locale, 'done_resubscribed_all', ws);
  // The way back: undo exactly what was just done, from the same signed page.
  const undo =
    outcome.kind === 'unsubscribed'
      ? actionForm(
          view,
          { action: 'resubscribe', scope: outcome.topic ? 'topic' : 'all', topicId: outcome.topic?.id },
          t(locale, 'undo_resubscribe'),
          'link-button',
        )
      : actionForm(
          view,
          { action: 'unsubscribe', scope: outcome.topic ? 'topic' : 'all', topicId: outcome.topic?.id },
          t(locale, 'undo_unsubscribe'),
          'link-button',
        );
  const showUndo = !(outcome.kind === 'unsubscribed' && view.all === 'paused');
  return (
    '<div class="notice" role="status">' +
    `<p>${text}</p>` +
    (showUndo ? `<p>${t(locale, 'undo_prompt')}</p>${undo}` : '') +
    '</div>'
  );
}

export function renderPreferences(view: PreferencesView): string {
  const { locale } = view;
  const ws = { workspace: view.workspaceName };
  const heading =
    view.outcome?.kind === 'unsubscribed'
      ? t(locale, 'done_unsubscribed_title')
      : view.outcome?.kind === 'resubscribed'
        ? t(locale, 'done_resubscribed_title')
        : t(locale, 'manage_title');

  const testBanner = view.isTest ? `<div class="notice note"><p>${t(locale, 'test_banner')}</p></div>` : '';

  // The one-step answer to "stop this mail": shown until that topic is off.
  const mailTopic =
    !view.outcome && view.mailTopic && view.all === 'open' && view.mailTopic.state !== 'unsubscribed' && view.mailTopic.state !== 'paused'
      ? `<p>${t(locale, 'topic_intro', { topic: view.mailTopic.name })}</p>` +
        actionForm(
          view,
          { action: 'unsubscribe', scope: 'topic', topicId: view.mailTopic.id },
          t(locale, 'topic_button', { topic: view.mailTopic.name }),
          'primary',
        )
      : '';

  const topics =
    view.topics.length > 0
      ? `<ul>${view.topics.map((topic) => topicRow(view, topic)).join('')}</ul>`
      : `<p class="lead">${t(locale, 'no_topics')}</p>`;

  let all: string;
  if (view.all === 'open') {
    all = `<p class="lead">${t(locale, 'all_text', ws)}</p>` + actionForm(view, { action: 'unsubscribe', scope: 'all' }, t(locale, 'all_button'));
  } else if (view.all === 'unsubscribed') {
    all =
      `<p>${t(locale, 'all_blocked_text', ws)}</p>` +
      actionForm(view, { action: 'resubscribe', scope: 'all' }, t(locale, 'all_resubscribe_button'));
  } else {
    all = `<p>${t(locale, 'state_paused')}</p>`;
  }

  const body =
    '<div class="card">' +
    `<p class="sender">${escapeHtml(view.workspaceName)}</p>` +
    `<h1>${heading}</h1>` +
    testBanner +
    outcomeNotice(view) +
    (view.outcome ? '' : `<p class="lead">${t(locale, 'manage_lead', ws)}</p>`) +
    (view.maskedEmail ? `<p class="address">${t(locale, 'address_line', { email: view.maskedEmail })}</p>` : '') +
    mailTopic +
    `<section aria-labelledby="topics-h"><h2 id="topics-h">${t(locale, 'topics_heading')}</h2>${topics}</section>` +
    `<section aria-labelledby="all-h"><h2 id="all-h">${t(locale, 'all_heading')}</h2>${all}</section>` +
    '</div>' +
    languageSwitch(locale, view.offered, view.path) +
    `<footer><p>${t(locale, 'footer', ws)}</p></footer>`;

  return page(locale, t(locale, 'doc_title', ws), body);
}

export type MessageKind = 'gone' | 'invalid' | 'cross_site' | 'error';

/**
 * A page with one message and nothing else: an unusable link, an erased contact,
 * a refused cross-site request, or our own failure. It names nothing from the
 * token, so it discloses nothing about whose link it was, beyond the workspace
 * name when the link was genuine.
 */
export function renderMessage(input: {
  kind: MessageKind;
  locale: PageLocale;
  offered: readonly PageLocale[];
  workspaceName?: string | null;
}): string {
  const { kind, locale } = input;
  const keys = {
    gone: ['gone_title', 'gone_text'],
    invalid: ['invalid_title', 'invalid_text'],
    cross_site: ['cross_site_title', 'cross_site_text'],
    error: ['error_title', 'error_text'],
  } as const satisfies Record<MessageKind, readonly [MessageKey, MessageKey]>;
  const [titleKey, textKey] = keys[kind];
  const title = t(locale, titleKey);
  const body =
    '<div class="card">' +
    (input.workspaceName ? `<p class="sender">${escapeHtml(input.workspaceName)}</p>` : '') +
    `<h1>${title}</h1><p class="lead">${t(locale, textKey)}</p>` +
    '</div>' +
    languageSwitch(locale, input.offered, null);
  return page(locale, title, body);
}
