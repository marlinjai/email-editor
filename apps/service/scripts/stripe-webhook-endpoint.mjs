#!/usr/bin/env node
/**
 * Registers the service's Stripe webhook endpoint and hands its signing secret
 * to the secrets proxy's capture, never to stdout.
 *
 *   node scripts/stripe-webhook-endpoint.mjs https://mail.lumitra.co/stripe/webhook
 *   node scripts/stripe-webhook-endpoint.mjs <url> --live        # live mode, Marlin's decision
 *   node scripts/stripe-webhook-endpoint.mjs <url> --recreate    # replace an existing endpoint
 *
 * Run through execute_with_secrets (Infisical project "Lumitra Mail"
 * f868ed33-e6d0-4f12-9075-7ee1ea7fd7a4) with a capture named
 * STRIPE_WEBHOOK_SECRET whose destination is that project's
 * STRIPE_WEBHOOK_SECRET: Stripe returns the `whsec_` secret only in the
 * create response, and this script writes it to
 * $SECRETS_CAPTURE_DIR/STRIPE_WEBHOOK_SECRET as its first act, then prints
 * only non-secret fields (id, url, events) and the secret's shape.
 *
 * Idempotent: an endpoint for the URL tagged metadata.product=mail is reused
 * (and its events brought up to date). Its secret cannot be read back, so an
 * existing endpoint without a stored secret needs --recreate, which deletes it
 * and creates a new one (the old secret stops working at once).
 *
 * The events are STRIPE_WEBHOOK_EVENTS in src/routes/stripe-webhook.ts; keep
 * the two lists equal. The endpoint is pinned to the service's API version.
 */

const key = process.env.STRIPE_SECRET_KEY;
const url = process.argv[2];
const live = process.argv.includes('--live');
const recreate = process.argv.includes('--recreate');
const captureDir = process.env.SECRETS_CAPTURE_DIR;

if (!key || key === 'PLACEHOLDER_REPLACE_ME') {
  console.error('STRIPE_SECRET_KEY is not set. Run this through execute_with_secrets (Infisical project Lumitra Mail).');
  process.exit(2);
}
if (!url || !/^https:\/\/[^/]+\/stripe\/webhook$/.test(url)) {
  console.error('usage: stripe-webhook-endpoint.mjs https://<service host>/stripe/webhook [--live] [--recreate]');
  process.exit(2);
}
if (key.startsWith('sk_live_') !== live) {
  console.error(live ? 'ABORT: --live with a TEST key.' : 'ABORT: a LIVE key without --live.');
  process.exit(2);
}

const API = 'https://api.stripe.com/v1';
const API_VERSION = '2025-03-31.basil';
const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
];

async function stripe(method, path, form) {
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Stripe-Version': API_VERSION };
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json?.error?.message ?? `HTTP ${res.status}`}`);
  return json;
}

const eventsForm = Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e]));
const list = await stripe('GET', '/webhook_endpoints?limit=100');
const existing = list.data.find((e) => e.url === url && e.metadata?.product === 'mail');

if (existing && !recreate) {
  await stripe('POST', `/webhook_endpoints/${existing.id}`, eventsForm);
  console.log(`endpoint ${existing.id} exists for ${url}; events brought up to date: ${EVENTS.join(', ')}`);
  console.log('Its signing secret cannot be read back. If Infisical does not hold it, run again with --recreate.');
  process.exit(0);
}
if (existing) {
  await stripe('DELETE', `/webhook_endpoints/${existing.id}`);
  console.log(`endpoint ${existing.id} deleted (--recreate)`);
}

const created = await stripe('POST', '/webhook_endpoints', {
  url,
  api_version: API_VERSION,
  description: `Lumitra Mail billing (${live ? 'live' : 'test'}, created ${new Date().toISOString().slice(0, 10)})`,
  'metadata[product]': 'mail',
  ...eventsForm,
});
const secret = created.secret;
if (!secret || !secret.startsWith('whsec_')) {
  console.error(`ABORT: endpoint ${created.id} was created but no whsec_ secret came back; delete it in Stripe and run again.`);
  process.exit(1);
}
if (captureDir) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${captureDir}/STRIPE_WEBHOOK_SECRET`, secret, { mode: 0o600 });
} else {
  console.error(`ABORT: SECRETS_CAPTURE_DIR is not set, so the secret would be lost. Endpoint ${created.id} was created; run again with --recreate through the secrets proxy.`);
  process.exit(1);
}
console.log(`endpoint ${created.id} created for ${created.url}, events: ${created.enabled_events.join(', ')}`);
console.log(`signing secret: whsec_* (${secret.length} characters), written to the capture`);
