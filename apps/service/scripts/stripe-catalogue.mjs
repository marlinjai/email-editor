#!/usr/bin/env node
/**
 * The Lumitra Mail catalogue on the shared Lumitra Stripe account: one Product
 * and one monthly Price per sold plan (lookup keys mail-starter-monthly and
 * mail-growth-monthly), and a customer-portal configuration that lets a
 * subscriber switch between those two Prices or cancel at the period's end.
 * The pattern of lumitra-qr/scripts/stripe-catalogue.mjs.
 *
 *   node scripts/stripe-catalogue.mjs          # test mode (refuses a live key)
 *   node scripts/stripe-catalogue.mjs --live   # live mode, Marlin's decision
 *
 * Idempotent, so a re-run after a partial failure creates no duplicates:
 *   - Prices are found by lookup_key first (Stripe refuses a second active
 *     Price with the same key anyway).
 *   - Products are matched by name and metadata.product over the active list
 *     (not /search, which lags up to a minute).
 *   - The portal configuration is matched by metadata.product.
 *   - Every POST carries an Idempotency-Key.
 *
 * Reads STRIPE_SECRET_KEY from the environment only; run it through the
 * secrets proxy (execute_with_secrets, Infisical project "Lumitra Mail"
 * f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4) so the key is injected server-side,
 * passing this file as a heredoc to `node --input-type=module`. Prints ids,
 * lookup keys and amounts only, never the key, and ends with the three
 * configuration lines to store (they are ids, not secrets).
 *
 * The amounts mirror PLANS in src/billing/plans.ts (display only): change both
 * together. Prices are final (no VAT charged under paragraph 19 UStG, as for
 * Lumitra QR), which is why that sentence is on the Product description.
 */

const key = process.env.STRIPE_SECRET_KEY;
const live = process.argv.includes('--live');
if (!key || key === 'PLACEHOLDER_REPLACE_ME') {
  console.error('STRIPE_SECRET_KEY is not set. Run this through execute_with_secrets (Infisical project Lumitra Mail).');
  process.exit(2);
}
if (key.startsWith('sk_live_') && !live) {
  console.error('ABORT: a LIVE key without --live. Live mode is a deliberate step (see ROADMAP.md).');
  process.exit(2);
}
if (key.startsWith('sk_test_') && live) {
  console.error('ABORT: --live with a TEST key.');
  process.exit(2);
}

const API = 'https://api.stripe.com/v1';
const API_VERSION = '2025-03-31.basil';
const IDEMPOTENCY_VERSION = 'v1';
const TAG = 'mail';
const TAX_SAAS = 'txcd_10103001';
const FINAL_PRICE = 'Final price, no VAT charged (§ 19 UStG).';

const PRODUCTS = [
  { key: 'mail-starter', name: 'Lumitra Mail Starter', description: `10,000 emails a month, 5,000 contacts, 5 team members. ${FINAL_PRICE}` },
  { key: 'mail-growth', name: 'Lumitra Mail Growth', description: `50,000 emails a month, 25,000 contacts, 20 team members, A/B tests. ${FINAL_PRICE}` },
];
const PRICES = [
  { lookupKey: 'mail-starter-monthly', product: 'mail-starter', amount: 900, env: 'STRIPE_PRICE_STARTER_ID' },
  { lookupKey: 'mail-growth-monthly', product: 'mail-growth', amount: 2900, env: 'STRIPE_PRICE_GROWTH_ID' },
];

async function stripe(method, path, form, idempotencyKey) {
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Stripe-Version': API_VERSION };
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  if (idempotencyKey) headers['Idempotency-Key'] = `mail-catalogue-${idempotencyKey}-${live ? 'live' : 'test'}-${IDEMPOTENCY_VERSION}`;
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const json = await res.json();
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
    if (!page.has_more) return out;
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
      if (Object.keys(patch).length) await stripe('POST', `/products/${found.id}`, patch, `product-patch-${p.key}-${Object.keys(patch).join('-')}`);
      console.log(`product ${p.key}: exists ${found.id}${Object.keys(patch).length ? ` (patched ${Object.keys(patch).join(',')})` : ''}`);
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
  const found = await stripe('GET', `/prices?${new URLSearchParams([...PRICES.map((p) => ['lookup_keys[]', p.lookupKey]), ['limit', '100']])}`);
  const ids = {};
  for (const p of PRICES) {
    const existing = found.data.find((e) => e.lookup_key === p.lookupKey && e.active);
    if (existing) {
      if (existing.unit_amount !== p.amount || existing.currency !== 'eur' || existing.recurring?.interval !== 'month') {
        throw new Error(`price ${p.lookupKey} exists as ${existing.id} with a different amount or interval; archive it in Stripe first`);
      }
      ids[p.env] = existing.id;
      console.log(`price ${p.lookupKey}: exists ${existing.id} (EUR ${(p.amount / 100).toFixed(2)} / month)`);
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
    ids[p.env] = created.id;
    console.log(`price ${p.lookupKey}: created ${created.id} (EUR ${(p.amount / 100).toFixed(2)} / month)`);
  }
  return ids;
}

async function ensurePortal(productIds, priceIds) {
  const configs = await listAll('/billing_portal/configurations', { active: 'true' });
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
  const existing = configs.find((c) => c.metadata?.product === TAG);
  if (existing) {
    await stripe('POST', `/billing_portal/configurations/${existing.id}`, form, `portal-update-${priceIds.STRIPE_PRICE_STARTER_ID}-${priceIds.STRIPE_PRICE_GROWTH_ID}`);
    console.log(`portal configuration: exists ${existing.id} (brought up to date)`);
    return existing.id;
  }
  const created = await stripe('POST', '/billing_portal/configurations', form, 'portal');
  console.log(`portal configuration: created ${created.id}`);
  return created.id;
}

const productIds = await ensureProducts();
const priceIds = await ensurePrices(productIds);
const portalId = await ensurePortal(productIds, priceIds);
console.log(`\n# configuration for Infisical "Lumitra Mail" (${live ? 'prod' : 'dev'}), ids only:`);
console.log(`STRIPE_PRICE_STARTER_ID=${priceIds.STRIPE_PRICE_STARTER_ID}`);
console.log(`STRIPE_PRICE_GROWTH_ID=${priceIds.STRIPE_PRICE_GROWTH_ID}`);
console.log(`STRIPE_PORTAL_CONFIGURATION_ID=${portalId}`);
