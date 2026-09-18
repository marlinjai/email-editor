import { createHash } from 'node:crypto';
import type { Plan } from '@marlinjai/mail-contract';
import { PAGE_LOCALES, type PageLocale } from './i18n.js';
import { LANDING_MESSAGES, type LandingKey } from './landing-i18n.js';
import { escapeHtml } from './render.js';

/**
 * The public landing page at the service's root (`/`, `/en`, `/de`, ...).
 *
 * Server-rendered, no JavaScript, no request to anyone else: no web fonts (the
 * system stack of the email-mcp site, so both pages read as one family), no
 * images besides the service's own icon, one inline stylesheet allowed by its
 * hash. The look is the Lumitra brand: dark only, pure black, brushed-gold
 * gradients, with the tokens of `email-mcp/site/style.css`.
 */

export const SIGN_IN_URL = 'https://app.mail.lumitra.co';
export const DOCS_URL = 'https://docs.email-editor.lumitra.co';
export const EMAIL_MCP_URL = 'https://email.lumitra.co';
export const IMPRINT_URL = 'https://lumitra.co/impressum';
export const PRIVACY_URL = 'https://lumitra.co/datenschutz';

/** The Open Graph locale of each page language. */
const OG_LOCALE: Record<PageLocale, string> = { en: 'en_GB', de: 'de_DE', it: 'it_IT', fr: 'fr_FR', es: 'es_ES' };

/** The path a locale's page is served at; English has its own path so a switch to it never re-negotiates. */
export function landingPath(locale: PageLocale): string {
  return `/${locale}`;
}

/** A translated string with its `{placeholders}` filled; template and values are both escaped. */
export function lt(locale: PageLocale, key: LandingKey, vars: Record<string, string> = {}): string {
  return escapeHtml(LANDING_MESSAGES[locale][key]).replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? escapeHtml(vars[name]!) : whole,
  );
}

/** The mark from the dashboard's icon: a gold envelope on a dark rounded card. */
export const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#c9a04a"/><stop offset="0.42" stop-color="#f1d37a"/>' +
  '<stop offset="0.58" stop-color="#d9b552"/><stop offset="1" stop-color="#c9a04a"/>' +
  '</linearGradient></defs>' +
  '<rect width="64" height="64" rx="14" fill="#0f0e0c"/>' +
  '<rect x="12" y="18" width="40" height="28" rx="4" fill="none" stroke="url(#g)" stroke-width="3.5"/>' +
  '<path d="M14 21 L32 35 L50 21" fill="none" stroke="url(#g)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>' +
  '</svg>';

/** The same mark inline in the page, with its own gradient id and no accessible name (the brand text names it). */
const INLINE_MARK = ICON_SVG.replace('<svg ', '<svg aria-hidden="true" focusable="false" width="28" height="28" ')
  .replace('id="g"', 'id="lm-mark"')
  .replace(/url\(#g\)/g, 'url(#lm-mark)');

const CHECK =
  '<svg class="check" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16">' +
  '<path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ARROW =
  '<svg class="arrow" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">' +
  '<path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Tokens from email-mcp/site/style.css. Verified contrast on the darkest and the
// lightest surface (WCAG 2.2 SC 1.4.3): --ink 18.9:1 on black, --muted 8.0:1 on
// black and 7.2:1 on --panel, --gold-ink on the gradient's darkest stop 7.6:1,
// the gold text gradient's darkest stop 8.6:1 on black. The focus ring (#f1d37a)
// is 14:1 on black (SC 1.4.11 asks 3:1).
const CSS = `
:root{color-scheme:dark;--bg:#000;--panel:#121110;--panel-2:#191714;--ink:#f3f2f7;--muted:#a89f8c;--line:rgba(255,255,255,.11);--line-soft:rgba(255,255,255,.06);--accent:#e0bb54;--focus:#f1d37a;--gold-ink:#1a1200;--gold-edge:rgba(241,211,122,.35);--gold-grad:repeating-linear-gradient(115deg,rgba(255,255,255,.10) 0 1px,rgba(255,255,255,0) 1px 3px),linear-gradient(135deg,#c9a04a 0%,#f1d37a 42%,#d9b552 58%,#c9a04a 100%);--gold-text-grad:linear-gradient(135deg,#c9a04a 0%,#f1d37a 50%,#e0bb54 100%);--radius:14px;--ease:cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box}
html{background:#000;scrollbar-color:#3a3326 #000;-webkit-text-size-adjust:100%;scroll-padding-top:5rem}
body{margin:0;min-height:100svh;color:var(--ink);font:400 1.0625rem/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;background:radial-gradient(900px 560px at 30% -8%,rgba(224,187,84,.20),rgba(224,187,84,0) 70%),radial-gradient(1400px 900px at 85% 110%,rgba(224,187,84,.06),rgba(224,187,84,0) 60%),repeating-linear-gradient(115deg,rgba(255,255,255,.018) 0 1px,rgba(255,255,255,0) 1px 4px),linear-gradient(160deg,#0d0b08 0%,#000 42%,#000 58%,#0b0906 100%) #000}
::selection{background:#e0bb54;color:#1a1200}
h1,h2,h3{margin:0;letter-spacing:-.025em;line-height:1.15;text-wrap:balance}
p{margin:0}
a{color:inherit;text-underline-offset:.2em;text-decoration-thickness:1px;text-decoration-color:rgba(241,211,122,.55)}
a:hover{text-decoration-color:var(--focus)}
a:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:1rem;top:-4rem;z-index:50;padding:.625rem 1rem;border-radius:10px;background:var(--gold-grad);color:var(--gold-ink);font-weight:620;text-decoration:none}
.skip:focus{top:1rem}
.wrap{max-width:1080px;margin:0 auto;padding:0 1.25rem}
@media (min-width:40rem){.wrap{padding:0 1.5rem}}
.nav{position:sticky;top:0;z-index:20;background:rgba(0,0,0,.6);border-bottom:1px solid var(--line-soft);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:4rem}
.brand{display:flex;align-items:center;gap:.625rem;font-weight:650;letter-spacing:-.02em;text-decoration:none;min-height:44px}
.brand svg{flex:none;border-radius:8px}
.nav ul{display:flex;align-items:center;gap:.25rem 1.25rem;list-style:none;margin:0;padding:0}
.nav li a{display:inline-flex;align-items:center;min-height:44px;color:var(--muted);text-decoration:none;font-size:.9375rem;font-weight:500;transition:color 150ms var(--ease)}
.nav li a:hover{color:var(--ink)}
.nav li.opt{display:none}
@media (min-width:44rem){.nav li.opt{display:list-item}}
.nav li a.btn{color:var(--gold-ink);padding:0 1rem;min-height:40px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:48px;padding:0 1.5rem;border-radius:11px;border:1px solid var(--gold-edge);background:var(--gold-grad);color:var(--gold-ink);font-weight:620;font-size:1rem;text-decoration:none;box-shadow:0 1px 0 rgba(255,255,255,.25) inset;transition:transform 150ms var(--ease),filter 150ms var(--ease)}
.btn:hover{filter:brightness(1.07);transform:translateY(-1px)}
.btn:active{transform:translateY(0);filter:brightness(.97)}
.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line);box-shadow:none}
.btn.ghost:hover{border-color:rgba(241,211,122,.45)}
.btn .arrow{transition:transform 150ms var(--ease)}
.btn:hover .arrow{transform:translateX(2px)}
.hero{display:grid;gap:3rem;align-items:center;padding:3.5rem 0 4.5rem}
@media (min-width:60rem){.hero{grid-template-columns:1.1fr .9fr;gap:4rem;padding:6rem 0 7rem}}
h1{font-size:clamp(2.25rem,5.4vw,3.75rem);font-weight:700;letter-spacing:-.035em;line-height:1.05}
h1 .gold{display:block;color:var(--accent);background:var(--gold-text-grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.lede{max-width:36rem;margin-top:1.5rem;color:var(--muted);font-size:1.1875rem;line-height:1.6}
.cta-row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem}
.note{margin-top:1rem;color:var(--muted);font-size:.9375rem}
figure{margin:0}
.mock{position:relative;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(180deg,#171512 0%,#0e0d0b 100%);overflow:hidden}
.mock-head{padding:1rem 1.25rem;border-bottom:1px solid var(--line-soft);font-size:.875rem;display:grid;gap:.25rem}
.mock-head .from{font-weight:600}
.mock-head .subject{color:var(--muted)}
.mock-body{padding:1.5rem 1.25rem 1.25rem;display:grid;gap:.75rem}
.mock-body .hello{font-weight:600}
.bar{height:.625rem;border-radius:5px;background:rgba(255,255,255,.08)}
.bar.w9{width:92%}.bar.w7{width:74%}.bar.w8{width:84%}
.mock-button{justify-self:start;margin-top:.5rem;width:9rem;height:2.25rem;border-radius:9px;background:var(--gold-grad);border:1px solid var(--gold-edge)}
.mock-foot{margin-top:.75rem;padding:1rem 1.25rem 1.25rem;border-top:1px dashed var(--line);font-size:.8125rem;color:var(--muted);display:flex;flex-wrap:wrap;gap:.25rem .75rem;align-items:center}
.mock-foot .unsub{color:var(--ink);text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:.2em;text-decoration-thickness:2px}
.mock-foot .url{flex-basis:100%;font:500 .75rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8d8575}
figcaption{margin-top:1rem;color:var(--muted);font-size:.9375rem;max-width:30rem}
section{padding:4.5rem 0;border-top:1px solid var(--line-soft)}
@media (min-width:60rem){section{padding:6rem 0}}
h2{font-size:clamp(1.75rem,3.4vw,2.5rem);font-weight:680}
.section-lead{margin-top:1rem;max-width:40rem;color:var(--muted);font-size:1.125rem}
.paths{display:grid;gap:2.5rem;margin-top:2.5rem}
@media (min-width:48rem){.paths{grid-template-columns:1fr 1fr;gap:0}.paths>div{padding-right:3rem}.paths>div+div{padding:0 0 0 3rem;border-left:1px solid var(--line)}}
h3{font-size:1.1875rem;font-weight:650;letter-spacing:-.015em}
.paths h3{font-size:1.375rem}
.paths p,.features p{margin-top:.625rem;color:var(--muted);max-width:34rem}
.features{display:grid;gap:0 3rem;margin-top:2.5rem;list-style:none;padding:0}
@media (min-width:48rem){.features{grid-template-columns:1fr 1fr}}
.features li{padding:1.5rem 0;border-top:1px solid var(--line)}
.features h3::before{content:"";display:block;width:1.75rem;height:3px;margin-bottom:1rem;border-radius:2px;background:var(--gold-grad)}
.privacy{display:grid;gap:2.5rem}
@media (min-width:60rem){.privacy{grid-template-columns:.9fr 1.1fr;gap:4rem}}
.ticks{list-style:none;margin:0;padding:0;display:grid;gap:1.25rem}
.ticks li{display:grid;grid-template-columns:1.5rem 1fr;gap:.75rem;align-items:start}
.check{color:var(--accent);margin-top:.3rem}
.plans{list-style:none;margin:2.5rem 0 0;padding:0;display:grid;gap:1.25rem;font-variant-numeric:tabular-nums}
@media (min-width:56rem){.plans{grid-template-columns:repeat(3,1fr)}}
.plan{display:flex;flex-direction:column;gap:1.25rem;padding:1.75rem 1.5rem;border:1px solid var(--line);border-radius:var(--radius);background:linear-gradient(180deg,var(--panel-2),var(--panel))}
.plan.first{border-color:var(--gold-edge)}
.plan-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;min-height:2rem}
.badge{font-size:.8125rem;font-weight:600;padding:.25rem .625rem;border-radius:999px;border:1px solid var(--gold-edge);color:var(--focus)}
.price{font-size:2.25rem;font-weight:700;letter-spacing:-.03em;line-height:1}
.price small{font-size:.9375rem;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:.375rem}
.plan ul{list-style:none;margin:0;padding:0;display:grid;gap:.5rem;font-size:.9375rem}
.plan li{display:grid;grid-template-columns:1.25rem 1fr;gap:.5rem}
.plan .check{margin-top:.25rem}
.plan .action{margin-top:auto}
.plan .btn{width:100%}
.soon{color:var(--muted);font-size:.9375rem}
.fine{margin-top:1.5rem;color:var(--muted);font-size:.875rem}
.recipients{padding:2rem 1.5rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel)}
@media (min-width:48rem){.recipients{padding:2.5rem 3rem}}
.recipients h2{font-size:clamp(1.375rem,2.4vw,1.75rem)}
.recipients p{margin-top:.875rem;color:var(--muted);max-width:44rem}
footer{border-top:1px solid var(--line-soft);padding:3rem 0 3.5rem;color:var(--muted);font-size:.9375rem}
footer .wrap{display:grid;gap:1.5rem}
footer h2{font-size:.8125rem;font-weight:600;letter-spacing:.02em;color:var(--muted)}
footer ul{list-style:none;margin:.25rem 0 0;padding:0;display:flex;flex-wrap:wrap;gap:0 1.25rem}
footer li a{display:inline-flex;align-items:center;min-height:44px;color:var(--ink)}
footer a[aria-current]{color:var(--focus);font-weight:650;text-decoration:none}
.family a{color:var(--ink);font-weight:600}
@media (min-width:48rem){footer .wrap{grid-template-columns:1fr auto auto;column-gap:4rem}.family,.footer-line{grid-column:1/-1}}
@media (prefers-reduced-motion:no-preference){.mock{animation:rise 280ms cubic-bezier(.16,1,.3,1) 60ms both}@keyframes rise{from{opacity:.35;transform:translateY(10px)}}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media (forced-colors:active){.btn,.plan,.mock,.recipients{border:1px solid CanvasText}h1 .gold{-webkit-text-fill-color:currentColor;background:none}}
`
  .replace(/\n/g, '')
  .trim();

const STYLE_HASH = createHash('sha256').update(CSS).digest('base64');

/**
 * The landing page's own policy, stricter than it needs to be: nothing but the
 * one stylesheet (by hash) and the service's own icon may load, no script at
 * all, no framing, no form posts, and `<base>` cannot redirect relative URLs.
 */
export const LANDING_CSP = [
  "default-src 'none'",
  `style-src 'sha256-${STYLE_HASH}'`,
  "img-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export type LandingPlan = {
  plan: Plan;
  /** Whether it can be bought on this instance right now (always true for a free plan). */
  sellable: boolean;
};

export type LandingView = {
  locale: PageLocale;
  /** The service's public origin without a trailing slash; every absolute URL is built on it. */
  baseUrl: string;
  /** The plans listed on the page, in order, with whether each can be bought now. */
  plans: readonly LandingPlan[];
};

function formatNumber(locale: PageLocale, n: number): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatPrice(locale: PageLocale, plan: Plan): string {
  const cents = plan.monthly_price_cents ?? 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function limitLine(locale: PageLocale, key: LandingKey, n: number | null): string | null {
  // An unlimited plan is not listed publicly; a null limit is simply not advertised.
  return n === null ? null : lt(locale, key, { n: formatNumber(locale, n) });
}

function planCard(locale: PageLocale, { plan, sellable }: LandingPlan, index: number): string {
  const free = !plan.monthly_price_cents;
  const { limits, features } = plan;
  const lines = [
    limitLine(locale, 'limit_messages', limits.monthly_messages),
    limitLine(locale, 'limit_contacts', limits.contacts),
    limitLine(locale, 'limit_members', limits.members),
    limits.providers === 1 ? lt(locale, 'limit_provider_one') : limitLine(locale, 'limit_providers', limits.providers),
    limits.webhook_endpoints === 1 ? lt(locale, 'limit_webhook_one') : limitLine(locale, 'limit_webhooks', limits.webhook_endpoints),
    features.tracking ? lt(locale, 'feature_tracking') : null,
    features.ab_testing ? lt(locale, 'feature_ab') : null,
  ].filter((l): l is string => l !== null);
  const headingId = `plan-${escapeHtml(plan.id)}`;
  const price = `<p class="price">${escapeHtml(formatPrice(locale, plan))}<small>${lt(locale, 'per_month')}</small></p>`;
  const action = sellable
    ? `<a class="btn${free ? '' : ' ghost'}" href="${SIGN_IN_URL}" aria-describedby="${headingId}">${
        free ? lt(locale, 'cta_free') : lt(locale, 'cta_plan', { plan: plan.name })
      }</a>`
    : `<p class="soon">${lt(locale, 'coming_soon_text')}</p>`;
  return (
    `<li class="plan${index === 0 ? ' first' : ''}"><div class="plan-head"><h3 id="${headingId}">${escapeHtml(plan.name)}</h3>` +
    (sellable ? '' : `<span class="badge">${lt(locale, 'coming_soon')}</span>`) +
    `</div>${price}<ul>${lines.map((l) => `<li>${CHECK}<span>${l}</span></li>`).join('')}</ul>` +
    `<div class="action">${action}</div></li>`
  );
}

function head(view: LandingView): string {
  const { locale, baseUrl } = view;
  const url = `${baseUrl}${landingPath(locale)}`;
  const title = lt(locale, 'meta_title');
  const description = lt(locale, 'meta_description');
  const alternates =
    PAGE_LOCALES.map((l) => `<link rel="alternate" hreflang="${l}" href="${baseUrl}${landingPath(l)}">`).join('') +
    `<link rel="alternate" hreflang="x-default" href="${baseUrl}/">`;
  return (
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${title}</title>` +
    `<meta name="description" content="${description}">` +
    '<meta name="color-scheme" content="dark">' +
    '<meta name="theme-color" content="#000000">' +
    '<meta name="referrer" content="strict-origin-when-cross-origin">' +
    `<link rel="canonical" href="${url}">` +
    alternates +
    '<link rel="icon" href="/icon.svg" type="image/svg+xml">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="Lumitra Mail">' +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${description}">` +
    `<meta property="og:url" content="${url}">` +
    `<meta property="og:locale" content="${OG_LOCALE[locale]}">` +
    PAGE_LOCALES.filter((l) => l !== locale)
      .map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">`)
      .join('') +
    `<meta property="og:image" content="${baseUrl}/og.png">` +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    `<meta property="og:image:alt" content="Lumitra Mail: ${lt(locale, 'hero_title_a')} ${lt(locale, 'hero_title_b')}">` +
    '<meta name="twitter:card" content="summary_large_image">' +
    `<style>${CSS}</style>`
  );
}

export function renderLanding(view: LandingView): string {
  const { locale, plans } = view;
  const free = plans.find((p) => !p.plan.monthly_price_cents)?.plan;
  const heroNote =
    free && free.limits.monthly_messages !== null
      ? `<p class="note">${lt(locale, 'hero_note', { messages: formatNumber(locale, free.limits.monthly_messages) })}</p>`
      : '';

  const nav =
    '<header class="nav"><div class="wrap">' +
    `<a class="brand" href="${landingPath(locale)}">${INLINE_MARK}<span>Lumitra Mail</span></a>` +
    `<nav aria-label="${lt(locale, 'nav_label')}"><ul>` +
    `<li class="opt"><a href="#features">${lt(locale, 'nav_features')}</a></li>` +
    `<li class="opt"><a href="#pricing">${lt(locale, 'nav_pricing')}</a></li>` +
    `<li><a href="${DOCS_URL}">${lt(locale, 'nav_docs')}</a></li>` +
    `<li><a class="btn" href="${SIGN_IN_URL}">${lt(locale, 'nav_signin')}</a></li>` +
    '</ul></nav></div></header>';

  const hero =
    '<div class="hero">' +
    '<div>' +
    `<h1>${lt(locale, 'hero_title_a')} <span class="gold">${lt(locale, 'hero_title_b')}</span></h1>` +
    `<p class="lede">${lt(locale, 'hero_lead')}</p>` +
    '<div class="cta-row">' +
    `<a class="btn" href="${SIGN_IN_URL}">${lt(locale, 'cta_signin')}${ARROW}</a>` +
    `<a class="btn ghost" href="${DOCS_URL}">${lt(locale, 'cta_docs')}</a>` +
    '</div>' +
    heroNote +
    '</div>' +
    '<figure>' +
    '<div class="mock" aria-hidden="true">' +
    `<div class="mock-head"><span class="from">${lt(locale, 'mock_from')}</span><span class="subject">${lt(locale, 'mock_subject')}</span></div>` +
    `<div class="mock-body"><p class="hello">${lt(locale, 'mock_greeting')}</p>` +
    '<div class="bar w9"></div><div class="bar w7"></div><div class="bar w8"></div><div class="mock-button"></div></div>' +
    `<div class="mock-foot"><span class="unsub">${lt(locale, 'mock_unsubscribe')}</span><span>${lt(locale, 'mock_preferences')}</span>` +
    `<span class="url">mail.lumitra.co/u/…</span></div>` +
    '</div>' +
    `<figcaption>${lt(locale, 'mock_caption')}</figcaption>` +
    '</figure>' +
    '</div>';

  const featureKeys = ['provider', 'editor', 'unsub', 'webhooks', 'signup', 'segments', 'schedule', 'tracking'] as const;
  const features = featureKeys
    .map(
      (k) =>
        `<li><h3>${lt(locale, `f_${k}_title` as LandingKey)}</h3><p>${lt(locale, `f_${k}_text` as LandingKey)}</p></li>`,
    )
    .join('');

  const main =
    '<main id="main">' +
    `<div class="wrap">${hero}</div>` +
    '<section aria-labelledby="paths-h"><div class="wrap">' +
    `<h2 id="paths-h">${lt(locale, 'paths_title')}</h2>` +
    '<div class="paths">' +
    `<div><h3>${lt(locale, 'app_title')}</h3><p>${lt(locale, 'app_text')}</p></div>` +
    `<div><h3>${lt(locale, 'noapp_title')}</h3><p>${lt(locale, 'noapp_text')}</p></div>` +
    '</div></div></section>' +
    '<section id="features" aria-labelledby="features-h"><div class="wrap">' +
    `<h2 id="features-h">${lt(locale, 'features_title')}</h2>` +
    `<ul class="features">${features}</ul>` +
    '</div></section>' +
    '<section aria-labelledby="privacy-h"><div class="wrap privacy">' +
    `<div><h2 id="privacy-h">${lt(locale, 'privacy_title')}</h2><p class="section-lead">${lt(locale, 'privacy_lead')}</p></div>` +
    '<ul class="ticks">' +
    ['privacy_processor', 'privacy_eu', 'privacy_tracking']
      .map((k) => `<li>${CHECK}<span>${lt(locale, k as LandingKey)}</span></li>`)
      .join('') +
    '</ul></div></section>' +
    '<section id="pricing" aria-labelledby="pricing-h"><div class="wrap">' +
    `<h2 id="pricing-h">${lt(locale, 'pricing_title')}</h2>` +
    `<p class="section-lead">${lt(locale, 'pricing_lead')}</p>` +
    `<ul class="plans">${plans.map((p, i) => planCard(locale, p, i)).join('')}</ul>` +
    `<p class="fine">${lt(locale, 'pricing_note')}</p>` +
    '</div></section>' +
    '<section aria-labelledby="recipients-h"><div class="wrap"><div class="recipients">' +
    `<h2 id="recipients-h">${lt(locale, 'recipients_title')}</h2>` +
    `<p>${lt(locale, 'recipients_text')}</p>` +
    '</div></div></section>' +
    '</main>';

  const languages = PAGE_LOCALES.map((l) => {
    const name = escapeHtml(LANDING_MESSAGES[l].lang_name);
    return l === locale
      ? `<li><a href="${landingPath(l)}" aria-current="page" lang="${l}" hreflang="${l}">${name}</a></li>`
      : `<li><a href="${landingPath(l)}" lang="${l}" hreflang="${l}">${name}</a></li>`;
  }).join('');

  const footer =
    '<footer><div class="wrap">' +
    `<p class="family">${lt(locale, 'family_label')} <a href="${EMAIL_MCP_URL}">email-mcp</a>, ${lt(locale, 'family_text')}</p>` +
    `<nav aria-labelledby="legal-h"><h2 id="legal-h">${lt(locale, 'legal_label')}</h2><ul>` +
    `<li><a href="${IMPRINT_URL}" hreflang="de">${lt(locale, 'legal_imprint')}</a></li>` +
    `<li><a href="${PRIVACY_URL}" hreflang="de">${lt(locale, 'legal_privacy')}</a></li>` +
    '</ul></nav>' +
    `<nav aria-labelledby="lang-h"><h2 id="lang-h">${lt(locale, 'language_label')}</h2><ul>${languages}</ul></nav>` +
    `<p class="footer-line">${lt(locale, 'footer_line')}</p>` +
    '</div></footer>';

  return (
    '<!doctype html>' +
    `<html lang="${locale}"><head>${head(view)}</head>` +
    `<body><a class="skip" href="#main">${lt(locale, 'skip_link')}</a>${nav}${main}${footer}</body></html>`
  );
}
