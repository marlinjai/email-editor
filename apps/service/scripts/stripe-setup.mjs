#!/usr/bin/env node
/**
 * Lumitra Mail's whole Stripe setup in one run, on the shared Lumitra Stripe
 * account (the pattern of lumitra-qr/scripts/stripe-catalogue.mjs):
 *
 * 1. the catalogue: one Product and one monthly Price per sold plan (lookup
 *    keys mail-starter-monthly, mail-growth-monthly) and a customer-portal
 *    configuration that switches between those Prices or cancels at the
 *    period's end;
 * 2. the webhook endpoint at <service>/stripe/webhook for exactly the events
 *    src/routes/stripe-webhook.ts handles, pinned to the service's API version;
 * 3. every resulting id, and the endpoint's signing secret, written to the
 *    secrets proxy's capture directory, from where the proxy stores them in
 *    Infisical. Nothing secret is ever printed.
 *
 *   node --input-type=module - [flags] < stripe-setup.mjs
 *     (no flag)                                    test mode, the endpoint at https://mail.lumitra.co/stripe/webhook
 *     --webhook-url https://<host>/stripe/webhook  another endpoint URL
 *     --live                                       live mode, Marlin's decision
 *     --recreate                                   replace an existing endpoint (and capture its new secret)
 *
 * The one command (execute_with_secrets, Infisical project "Lumitra Mail"
 * f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4, env dev) is spelled out in
 * apps/service/README.md, "Stripe setup".
 *
 * Idempotent, so a re-run after a partial failure creates no duplicates:
 * Prices by lookup_key, Products by name and metadata.product over the active
 * list, the portal configuration and the endpoint by metadata.product, and
 * every create carries an Idempotency-Key. Stripe returns an endpoint's secret
 * only when it is created, so a re-run keeps the existing endpoint (and the
 * secret Infisical already holds) and writes no secret capture, unless
 * --recreate replaces the endpoint.
 *
 * The amounts mirror PLANS in src/billing/plans.ts (display only): change both
 * together; a unit test holds them equal. Prices are final (no VAT charged
 * under paragraph 19 UStG, as for Lumitra QR).
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const key = process.env.STRIPE_SECRET_KEY;
const live = flag('--live');
const recreate = flag('--recreate');
const webhookUrl = option('--webhook-url', 'https://mail.lumitra.co/stripe/webhook');
const captureDir = process.env.SECRETS_CAPTURE_DIR;
// Tests point this at stripe-mock or a fake; Stripe itself otherwise.
const API = process.env.STRIPE_API_BASE ?? 'https://api.stripe.com/v1';

function abort(message, code = 2) {
  console.error(`ABORT: ${message}`);
  process.exit(code);
}

if (!key || key === 'PLACEHOLDER_REPLACE_ME') abort('STRIPE_SECRET_KEY is not set. Run this through execute_with_secrets (Infisical project Lumitra Mail).');
if (!/^(sk|rk)_(test|live)_/.test(key)) abort('STRIPE_SECRET_KEY is not a Stripe secret key.');
if (key.includes('_live_') && !live) abort('a LIVE key without --live. Live mode is a deliberate step (ROADMAP.md).');
if (key.includes('_test_') && live) abort('--live with a TEST key.');
if (!/^https:\/\/[^/]+\/stripe\/webhook$/.test(webhookUrl)) abort('--webhook-url must be https://<service host>/stripe/webhook');
if (!captureDir) abort('SECRETS_CAPTURE_DIR is not set: run this through the secrets proxy with captures, or the ids and the secret are lost.');

const API_VERSION = '2025-03-31.basil';
const MODE = live ? 'live' : 'test';
const TAG = 'mail';
const TAX_SAAS = 'txcd_10103001';
const FINAL_PRICE = 'Final price, no VAT charged (§ 19 UStG).';

const PRODUCTS = [
  { key: 'mail-starter', name: 'Lumitra Mail Starter', description: `10,000 emails a month, 5,000 contacts, 5 team members. ${FINAL_PRICE}` },
  { key: 'mail-growth', name: 'Lumitra Mail Growth', description: `50,000 emails a month, 25,000 contacts, 20 team members, A/B tests. ${FINAL_PRICE}` },
];
const PRICES = [
  { lookupKey: 'mail-starter-monthly', product: 'mail-starter', amount: 900, capture: 'STRIPE_PRICE_STARTER_ID' },
  { lookupKey: 'mail-growth-monthly', product: 'mail-growth', amount: 2900, capture: 'STRIPE_PRICE_GROWTH_ID' },
];
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
];

/** Writes one value for the proxy to store; the value never reaches stdout. */
function capture(name, value) {
  writeFileSync(join(captureDir, name), value, { mode: 0o600 });
}

async function stripe(method, path, form, idempotencyKey) {
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Stripe-Version': API_VERSION };
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (idempotencyKey) headers['Idempotency-Key'] = `mail-setup-${idempotencyKey}-${MODE}-v1`;
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${method} ${path}: HTTP ${res.status}, not JSON`);
  }
  if (!res.ok) throw new Error(`${method} ${path}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  return json;
}

async function listAll(path, extra = {}) {
  const out = [];
  let startingAfter;
  for (;;) {
    const q = new URLSearchParams({ limit: '100', ...extra });
    if (startingAfter) q.set('starting_after', startingAfter);
    const page = await stripe('GET', `${path}?${q}`);
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) return out;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

async function ensureProducts() {
  const existing = await listAll('/products', { active: 'true' });
  const ids = {};
  for (const p of PRODUCTS) {
    const found = existing.find((e) => e.name === p.name && e.metadata?.product === TAG);
    if (found) {
      ids[p.key] = found.id;
      const patch = {};
      if (found.tax_code !== TAX_SAAS) patch.tax_code = TAX_SAAS;
      if (found.description !== p.description) patch.description = p.description;
      if (Object.keys(patch).length) await stripe('POST', `/products/${found.id}`, patch);
      console.log(`product ${p.key}: exists ${found.id}${Object.keys(patch).length ? ` (updated ${Object.keys(patch).join(', ')})` : ''}`);
      continue;
    }
    const created = await stripe(
      'POST',
      '/products',
      { name: p.name, description: p.description, tax_code: TAX_SAAS, 'metadata[product]': TAG, 'metadata[catalogue_key]': p.key },
      `product-${p.key}`,
    );
    ids[p.key] = created.id;
    console.log(`product ${p.key}: created ${created.id}`);
  }
  return ids;
}

async function ensurePrices(productIds) {
  const q = new URLSearchParams([...PRICES.map((p) => ['lookup_keys[]', p.lookupKey]), ['limit', '100'], ['active', 'true']]);
  const found = await stripe('GET', `/prices?${q}`);
  const ids = {};
  for (const p of PRICES) {
    const existing = found.data.find((e) => e.lookup_key === p.lookupKey);
    if (existing) {
      if (existing.unit_amount !== p.amount || existing.currency !== 'eur' || existing.recurring?.interval !== 'month') {
        throw new Error(`price ${p.lookupKey} exists as ${existing.id} with another amount or interval; archive it in Stripe first`);
      }
      ids[p.capture] = existing.id;
      console.log(`price ${p.lookupKey}: exists ${existing.id}`);
      continue;
    }
    const created = await stripe(
      'POST',
      '/prices',
      {
        product: productIds[p.product],
        currency: 'eur',
        unit_amount: String(p.amount),
        'recurring[interval]': 'month',
        lookup_key: p.lookupKey,
        tax_behavior: 'inclusive',
        'metadata[product]': TAG,
      },
      `price-${p.lookupKey}`,
    );
    ids[p.capture] = created.id;
    console.log(`price ${p.lookupKey}: created ${created.id} (EUR ${(p.amount / 100).toFixed(2)} a month)`);
  }
  return ids;
}

async function ensurePortal(productIds, priceIds) {
  const form = {
    'business_profile[headline]': 'Lumitra Mail: your plan and invoices',
    'features[invoice_history][enabled]': 'true',
    'features[payment_method_update][enabled]': 'true',
    'features[customer_update][enabled]': 'true',
    'features[customer_update][allowed_updates][0]': 'email',
    'features[customer_update][allowed_updates][1]': 'address',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_update][enabled]': 'true',
    'features[subscription_update][default_allowed_updates][0]': 'price',
    'features[subscription_update][proration_behavior]': 'create_prorations',
    'features[subscription_update][products][0][product]': productIds['mail-starter'],
    'features[subscription_update][products][0][prices][0]': priceIds.STRIPE_PRICE_STARTER_ID,
    'features[subscription_update][products][1][product]': productIds['mail-growth'],
    'features[subscription_update][products][1][prices][0]': priceIds.STRIPE_PRICE_GROWTH_ID,
    'metadata[product]': TAG,
  };
  const existing = (await listAll('/billing_portal/configurations', { active: 'true' })).find((c) => c.metadata?.product === TAG);
  if (existing) {
    await stripe('POST', `/billing_portal/configurations/${existing.id}`, form);
    console.log(`portal configuration: exists ${existing.id} (brought up to date)`);
    return existing.id;
  }
  const created = await stripe('POST', '/billing_portal/configurations', form, 'portal');
  console.log(`portal configuration: created ${created.id}`);
  return created.id;
}

/** Returns whether a new signing secret was captured. */
async function ensureWebhook() {
  const eventsForm = Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e]));
  const existing = (await listAll('/webhook_endpoints')).find((e) => e.url === webhookUrl && e.metadata?.product === TAG);
  if (existing && !recreate) {
    await stripe('POST', `/webhook_endpoints/${existing.id}`, eventsForm);
    console.log(`webhook endpoint: exists ${existing.id} for ${webhookUrl} (events brought up to date); its secret cannot be read back, so none is captured`);
    return false;
  }
  if (existing) {
    await stripe('DELETE', `/webhook_endpoints/${existing.id}`);
    console.log(`webhook endpoint: deleted ${existing.id} (--recreate)`);
  }
  const created = await stripe('POST', '/webhook_endpoints', {
    url: webhookUrl,
    api_version: API_VERSION,
    description: `Lumitra Mail billing (${MODE})`,
    'metadata[product]': TAG,
    ...eventsForm,
  });
  const secret = created.secret;
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) {
    abort(`endpoint ${created.id} was created but no whsec_ secret came back; run again with --recreate`, 1);
  }
  // First act after it exists: a failure below must not lose it.
  capture('STRIPE_WEBHOOK_SECRET', secret);
  console.log(`webhook endpoint: created ${created.id} for ${webhookUrl}; signing secret whsec_* (${secret.length} characters) captured`);
  return true;
}

try {
  const productIds = await ensureProducts();
  const priceIds = await ensurePrices(productIds);
  const portalId = await ensurePortal(productIds, priceIds);
  capture('STRIPE_PRICE_STARTER_ID', priceIds.STRIPE_PRICE_STARTER_ID);
  capture('STRIPE_PRICE_GROWTH_ID', priceIds.STRIPE_PRICE_GROWTH_ID);
  capture('STRIPE_PORTAL_CONFIGURATION_ID', portalId);
  const newSecret = await ensureWebhook();
  console.log(`\ndone (${MODE} mode): captured STRIPE_PRICE_STARTER_ID, STRIPE_PRICE_GROWTH_ID, STRIPE_PORTAL_CONFIGURATION_ID${newSecret ? ', STRIPE_WEBHOOK_SECRET' : ''}`);
} catch (err) {
  abort(err instanceof Error ? err.message : String(err), 1);
}
