import { createHash } from 'node:crypto';
import axe from 'axe-core';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { LISTED_PLANS, PLANS, type BillingConfig } from '../../src/billing/plans.js';
import type { StripeApi } from '../../src/billing/stripe.js';
import { PAGE_LOCALES, type PageLocale } from '../../src/pages/i18n.js';
import { LANDING_MESSAGES } from '../../src/pages/landing-i18n.js';
import { formatPrice, LANDING_CSP, renderLanding } from '../../src/pages/landing-render.js';
import { landingPlans, landingRoutes, ROBOTS_DISALLOW } from '../../src/routes/landing.js';

const BASE = 'https://mail.test';
const NO_STRIPE: BillingConfig = { prices: {} };
const SELLING: BillingConfig = { prices: { starter: 'price_starter', growth: 'price_growth' } };
// Only its presence matters to the page; nothing here calls Stripe.
const FAKE_STRIPE = {} as StripeApi;

function app(billing: BillingConfig = NO_STRIPE, stripe: StripeApi | null = null) {
  return landingRoutes({ publicBaseUrl: BASE, billing, stripe });
}

function page(locale: PageLocale, billing: BillingConfig = NO_STRIPE, stripe: StripeApi | null = null): string {
  return renderLanding({ locale, baseUrl: BASE, plans: landingPlans(billing, stripe) });
}

function dom(html: string) {
  return new JSDOM(html).window.document;
}

describe('translations', () => {
  const english = LANDING_MESSAGES.en;

  it.each(PAGE_LOCALES)('%s says the editor imports MJML and exports MJML or HTML', (locale) => {
    const text = LANDING_MESSAGES[locale].f_editor_text;
    expect(text.match(/MJML/g)?.length, locale).toBe(2);
    expect(text, locale).toMatch(/HTML/);
    expect(page(locale)).toContain('MJML');
  });
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(PAGE_LOCALES)('%s has every key, non-empty, with the same placeholders as English', (locale) => {
    const messages = LANDING_MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(messages)) {
      expect(value.trim(), `${locale}.${key}`).not.toBe('');
      expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(english[key as keyof typeof english]));
    }
  });

  it('uses no en dash or em dash anywhere', () => {
    for (const locale of PAGE_LOCALES) {
      for (const [key, value] of Object.entries(LANDING_MESSAGES[locale])) {
        expect(/[\u2013\u2014]/.test(value), `${locale}.${key}`).toBe(false);
      }
    }
  });

  it('is formal in German and Spanish, like the hosted pages', () => {
    const joined = (l: PageLocale) => Object.values(LANDING_MESSAGES[l]).join(' ');
    expect(joined('de')).toMatch(/\bSie\b/);
    expect(joined('de')).not.toMatch(/\b(du|dich|dein|deine)\b/i);
    expect(joined('es')).not.toMatch(/\b(tú|te has)\b/i);
  });

  // Bounce handling differs by provider: with Resend, later bounces and spam
  // complaints are reported; over SMTP only a refusal during the send is seen
  // (iCloud+ reports almost every bounce later, by email). Each locale must say
  // exactly that, pinned word for word so the claim cannot drift back to an
  // unqualified one; open/click webhooks are not built yet, and the images are
  // on Cloudflare R2, so no locale may claim either or say the whole service is
  // hosted in the EU.
  const BOUNCE_CLAIM: Record<PageLocale, string> = {
    en: 'With Resend, hard bounces and spam complaints are blocked automatically. Over SMTP, addresses the server refuses outright are blocked.',
    de: 'Mit Resend werden unzustellbare Adressen und Spam-Beschwerden automatisch gesperrt. Über SMTP werden Adressen gesperrt, die der Server sofort ablehnt.',
    it: 'Con Resend, gli indirizzi inesistenti e le segnalazioni di spam vengono bloccati automaticamente. Via SMTP vengono bloccati gli indirizzi che il server rifiuta subito.',
    fr: 'Avec Resend, les adresses inexistantes et les plaintes pour spam sont bloquées automatiquement. Via SMTP, les adresses que le serveur refuse d’emblée sont bloquées.',
    es: 'Con Resend, las direcciones inexistentes y las quejas por spam se bloquean automáticamente. Por SMTP se bloquean las direcciones que el servidor rechaza de inmediato.',
  };
  const BOUNCE_WORDS: Record<PageLocale, RegExp> = {
    en: /bounce|complaint/i,
    de: /unzustellbar|beschwerde|rückläufer/i,
    it: /inesistent|segnalazion|rimbalz|reclam/i,
    fr: /inexistant|plainte|rebond/i,
    es: /inexistent|queja|rebot/i,
  };
  const OPEN_CLICK_WORDS: Record<PageLocale, RegExp> = {
    en: /\bopen|\bclick/i,
    de: /öffnung|klick/i,
    it: /apertur|\bclic/i,
    fr: /ouverture|\bclic/i,
    es: /apertur|\bclic/i,
  };

  it.each(PAGE_LOCALES)('%s claims only what the service does today', (locale) => {
    const messages = LANDING_MESSAGES[locale];
    const all = Object.values(messages).join(' ');
    expect(messages.f_unsub_text.endsWith(` ${BOUNCE_CLAIM[locale]}`)).toBe(true);
    // Bounces and complaints are claimed nowhere else.
    expect(all.replace(BOUNCE_CLAIM[locale], '')).not.toMatch(BOUNCE_WORDS[locale]);
    expect(messages.f_webhooks_text).not.toMatch(OPEN_CLICK_WORDS[locale]);
    expect(messages.app_text).not.toMatch(OPEN_CLICK_WORDS[locale]);
    expect(all).not.toMatch(/\b(EU|UE)\b|hosted in the EU/);
    expect(messages.privacy_eu).toMatch(/Hetzner/);
    expect(messages.privacy_eu).toMatch(/Cloudflare R2/);
  });

  it.each(PAGE_LOCALES)('%s renders with no unfilled placeholder and no stray key name', (locale) => {
    const html = page(locale);
    const text = dom(html).querySelector('body')?.textContent ?? '';
    expect(text).not.toMatch(/\{\w+\}/);
    expect(text).not.toMatch(/\b(f_\w+|limit_\w+|hero_\w+|cta_\w+)\b/);
  });
});

describe('the pages', () => {
  it.each(PAGE_LOCALES)('/%s answers 200 in its language with the landing CSP', async (locale) => {
    const res = await app().request(`/${locale}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('content-language')).toBe(locale);
    expect(res.headers.get('content-security-policy')).toBe(LANDING_CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const doc = dom(await res.text());
    expect(doc.documentElement.lang).toBe(locale);
    expect(doc.querySelector('link[rel=canonical]')?.getAttribute('href')).toBe(`${BASE}/${locale}`);
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('/ negotiates the language from ?lang= or Accept-Language and says it varies', async () => {
    const de = await app().request('/', { headers: { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5' } });
    expect(de.headers.get('content-language')).toBe('de');
    expect(de.headers.get('vary')).toMatch(/Accept-Language/);
    expect(de.headers.get('content-security-policy')).toBe(LANDING_CSP);
    const fr = await app().request('/?lang=fr', { headers: { 'Accept-Language': 'de' } });
    expect(fr.headers.get('content-language')).toBe('fr');
    // A crawler without the header, or a language the page lacks, gets English.
    expect((await app().request('/')).headers.get('content-language')).toBe('en');
    expect((await app().request('/', { headers: { 'Accept-Language': 'ja' } })).headers.get('content-language')).toBe('en');
    expect((await app().request('/?lang=xx')).headers.get('content-language')).toBe('en');
  });

  it('links every language, the sign-in, the docs, email-mcp and the legal pages', () => {
    const doc = dom(page('en'));
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    for (const l of PAGE_LOCALES) expect(hrefs).toContain(`/${l}`);
    expect(hrefs).toContain('https://app.mail.lumitra.co');
    expect(hrefs).toContain('https://docs.email-editor.lumitra.co');
    expect(hrefs).toContain('https://email.lumitra.co');
    expect(hrefs).toContain('https://lumitra.co/impressum');
    expect(hrefs).toContain('https://lumitra.co/datenschutz');
    expect(doc.querySelector('a[aria-current=page]')?.getAttribute('href')).toBe('/en');
    const alternates = [...doc.querySelectorAll('link[rel=alternate]')].map((l) => l.getAttribute('hreflang'));
    expect(alternates.sort()).toEqual([...PAGE_LOCALES, 'x-default'].sort());
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${BASE}/og.png`);
  });

  it('declares the charset first in the head', () => {
    expect(page('de')).toMatch(/^<!doctype html><html lang="de"><head><meta charset="utf-8">/);
  });
});

describe('Content-Security-Policy', () => {
  it.each(PAGE_LOCALES)('%s: the one inline stylesheet matches the hash in the policy', (locale) => {
    const html = page(locale);
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]!);
    expect(styles).toHaveLength(1);
    const hash = createHash('sha256').update(styles[0]!).digest('base64');
    expect(LANDING_CSP).toContain(`style-src 'sha256-${hash}'`);
  });

  it('allows no script, no inline style attribute and nothing from another origin', () => {
    for (const locale of PAGE_LOCALES) {
      const html = page(locale);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/\sstyle=/i);
      const doc = dom(html);
      const loaded = [
        ...[...doc.querySelectorAll('link[rel=icon], link[rel=stylesheet]')].map((l) => l.getAttribute('href')),
        ...[...doc.querySelectorAll('img, iframe, source')].map((e) => e.getAttribute('src')),
      ];
      for (const src of loaded) expect(src, locale).toMatch(/^\//);
    }
    expect(LANDING_CSP).toMatch(/default-src 'none'/);
    expect(LANDING_CSP).not.toMatch(/unsafe-inline|unsafe-eval|script-src/);
    expect(LANDING_CSP).toMatch(/frame-ancestors 'none'/);
  });
});

describe('pricing', () => {
  const planCards = (html: string) =>
    [...dom(html).querySelectorAll('.plan')].map((card) => ({
      name: card.querySelector('h3')?.textContent,
      price: card.querySelector('.price')?.textContent,
      soon: card.querySelector('.badge') !== null,
      action: card.querySelector('.action a')?.getAttribute('href') ?? null,
      text: card.textContent ?? '',
    }));

  it('lists exactly the public plans, with prices and limits from the plan catalogue', () => {
    for (const locale of PAGE_LOCALES) {
      const cards = planCards(page(locale));
      expect(cards.map((c) => c.name)).toEqual(LISTED_PLANS.map((p) => p.name));
      LISTED_PLANS.forEach((plan, i) => {
        expect(cards[i]!.price).toContain(formatPrice(locale, plan));
        const messages = new Intl.NumberFormat(locale).format(plan.limits.monthly_messages!);
        expect(cards[i]!.text).toContain(messages);
        expect(cards[i]!.text).toContain(new Intl.NumberFormat(locale).format(plan.limits.contacts!));
      });
    }
    // The operator's design-partner plan is never advertised.
    expect(page('en')).not.toContain(PLANS.design_partner.name);
  });

  it('formats from the cents, so a price change in the catalogue reaches the page', () => {
    expect(formatPrice('en', PLANS.starter)).toBe(`€${PLANS.starter.monthly_price_cents! / 100}`);
    expect(formatPrice('de', { ...PLANS.growth, monthly_price_cents: 2_950 })).toMatch(/^29,50\s€$/);
    expect(formatPrice('en', PLANS.free)).toBe('€0');
  });

  it('shows paid plans as coming soon while checkout would fail closed (no Stripe key)', () => {
    const cards = planCards(page('en', SELLING, null));
    expect(cards.map((c) => c.soon)).toEqual([false, true, true]);
    expect(cards.map((c) => c.action)).toEqual(['https://app.mail.lumitra.co', null, null]);
  });

  it('shows a paid plan as coming soon when its Stripe Price is missing, even with a key', () => {
    const cards = planCards(page('en', { prices: { starter: 'price_starter' } }, FAKE_STRIPE));
    expect(cards.map((c) => c.soon)).toEqual([false, false, true]);
  });

  it('offers every paid plan once Stripe and both Prices are configured', () => {
    const cards = planCards(page('en', SELLING, FAKE_STRIPE));
    expect(cards.map((c) => c.soon)).toEqual([false, false, false]);
    expect(cards.every((c) => c.action === 'https://app.mail.lumitra.co')).toBe(true);
  });

  it('names the free allowance in the hero from the free plan', () => {
    const note = dom(page('en')).querySelector('.note')?.textContent;
    expect(note).toContain(new Intl.NumberFormat('en').format(PLANS.free.limits.monthly_messages!));
  });
});

describe('robots.txt and the sitemap', () => {
  it('allows the landing page and keeps crawlers out of links, tracking, assets and the API', async () => {
    const res = await app().request('/robots.txt');
    expect(res.status).toBe(200);
    const lines = (await res.text()).split('\n');
    expect(lines).toContain('User-agent: *');
    expect(lines).toContain('Allow: /');
    for (const path of ['/u/', '/f/', '/t/', '/a/', '/v1/']) expect(lines).toContain(`Disallow: ${path}`);
    expect(ROBOTS_DISALLOW).not.toContain('/');
    expect(lines).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });

  it('lists every language page with its alternates', async () => {
    const res = await app().request('/sitemap.xml');
    expect(res.headers.get('content-type')).toMatch(/application\/xml/);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(PAGE_LOCALES.map((l) => `${BASE}/${l}`));
    expect(xml).toContain('hreflang="x-default"');
  });

  it('serves the icon, the Open Graph image and a favicon redirect', async () => {
    const icon = await app().request('/icon.svg');
    expect(icon.headers.get('content-type')).toBe('image/svg+xml');
    expect(await icon.text()).toMatch(/^<svg /);
    const og = await app().request('/og.png');
    expect(og.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await og.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fav = await app().request('/favicon.ico');
    expect(fav.status).toBe(301);
    expect(fav.headers.get('location')).toBe('/icon.svg');
  });
});

describe('accessibility (axe-core, WCAG 2.2 A and AA rules)', () => {
  async function violations(html: string) {
    const window = new JSDOM(html, { pretendToBeVisual: true }).window;
    const result = await axe.run(window.document.documentElement as never, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      // jsdom computes no layout, so colour contrast is checked by the tokens' measured ratios instead.
      rules: { 'color-contrast': { enabled: false } },
    });
    window.close();
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }

  it.each(PAGE_LOCALES)('%s: no violations, with paid plans coming soon and on sale', async (locale) => {
    expect(await violations(page(locale))).toEqual([]);
    expect(await violations(page(locale, SELLING, FAKE_STRIPE))).toEqual([]);
  });
});
