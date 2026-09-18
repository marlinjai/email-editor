import { Hono, type Context } from 'hono';
import { checkoutPriceId, LISTED_PLANS, type BillingConfig, type PaidPlanId } from '../billing/plans.js';
import type { StripeApi } from '../billing/stripe.js';
import type { AppEnv } from '../context.js';
import { chooseLocale, PAGE_LOCALES, type PageLocale } from '../pages/i18n.js';
import { OG_IMAGE_PNG_BASE64 } from '../pages/landing-og.js';
import { ICON_SVG, LANDING_CSP, landingPath, renderLanding, type LandingPlan } from '../pages/landing-render.js';

/**
 * The public face of the service at its root: the landing page, robots.txt,
 * the sitemap, the icon and the Open Graph image. Every mail the service sends
 * links to this host (unsubscribe links, images), so recipients land here too.
 *
 * - `/en`, `/de`, `/it`, `/fr`, `/es` are the pages, one fixed language each.
 * - `/` picks the language from `?lang=` or Accept-Language (English when
 *   neither matches), so it varies by that header and says so.
 * - Paid plans show as "coming soon" whenever checkout would fail closed on this
 *   instance (`checkoutPriceId`), so the page never offers what cannot be bought.
 *
 * Nothing here reads the database or needs a credential; a page is rendered
 * per request from the plan catalogue, which is a few microseconds of string
 * building.
 */

export type LandingRouteDeps = {
  /** The service's public origin without a trailing slash (canonical and Open Graph URLs). */
  publicBaseUrl: string;
  billing: BillingConfig;
  /** The Stripe client, or null without a key: then no paid plan is sellable. */
  stripe: StripeApi | null;
};

/** Paths search engines must stay out of: signed links, tracking, assets and the API. */
export const ROBOTS_DISALLOW = ['/u/', '/f/', '/t/', '/a/', '/v1/', '/internal/', '/stripe/'] as const;

const PAGE_CACHE = 'public, max-age=300';
const ASSET_CACHE = 'public, max-age=86400';

const OG_IMAGE = Buffer.from(OG_IMAGE_PNG_BASE64, 'base64');

export function landingPlans(billing: BillingConfig, stripe: StripeApi | null): LandingPlan[] {
  return LISTED_PLANS.map((plan) => ({
    plan,
    sellable: !plan.monthly_price_cents || checkoutPriceId(billing, stripe, plan.id as PaidPlanId) !== null,
  }));
}

export function robotsTxt(publicBaseUrl: string): string {
  return ['User-agent: *', 'Allow: /', ...ROBOTS_DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${publicBaseUrl}/sitemap.xml`, ''].join(
    '\n',
  );
}

export function sitemapXml(publicBaseUrl: string): string {
  const alternates = [
    ...PAGE_LOCALES.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${publicBaseUrl}${landingPath(l)}"/>`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${publicBaseUrl}/"/>`,
  ].join('');
  const urls = PAGE_LOCALES.map((l) => `<url><loc>${publicBaseUrl}${landingPath(l)}</loc>${alternates}</url>`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    urls +
    '</urlset>'
  );
}

export function landingRoutes({ publicBaseUrl, billing, stripe }: LandingRouteDeps) {
  const app = new Hono<AppEnv>();
  const baseUrl = publicBaseUrl.replace(/\/+$/, '');

  const page = (c: Context<AppEnv>, locale: PageLocale) => {
    c.header('Content-Security-Policy', LANDING_CSP);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Content-Language', locale);
    c.header('Cache-Control', PAGE_CACHE);
    return c.html(renderLanding({ locale, baseUrl, plans: landingPlans(billing, stripe) }));
  };

  app.get('/', (c) => {
    c.header('Vary', 'Accept-Language');
    const locale = chooseLocale({ offered: PAGE_LOCALES, explicit: c.req.query('lang'), acceptLanguage: c.req.header('Accept-Language') });
    return page(c, locale);
  });
  for (const locale of PAGE_LOCALES) app.get(landingPath(locale), (c) => page(c, locale));

  app.get('/robots.txt', (c) => {
    c.header('Cache-Control', ASSET_CACHE);
    return c.text(robotsTxt(baseUrl));
  });
  app.get('/sitemap.xml', (c) => {
    c.header('Cache-Control', ASSET_CACHE);
    return c.body(sitemapXml(baseUrl), 200, { 'Content-Type': 'application/xml; charset=utf-8' });
  });
  app.get('/icon.svg', (c) => {
    c.header('Cache-Control', ASSET_CACHE);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(ICON_SVG, 200, { 'Content-Type': 'image/svg+xml' });
  });
  // Browsers and crawlers ask for /favicon.ico whatever the page links.
  app.get('/favicon.ico', (c) => c.redirect('/icon.svg', 301));
  app.get('/og.png', (c) => {
    c.header('Cache-Control', ASSET_CACHE);
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(new Uint8Array(OG_IMAGE), 200, { 'Content-Type': 'image/png' });
  });

  return app;
}
