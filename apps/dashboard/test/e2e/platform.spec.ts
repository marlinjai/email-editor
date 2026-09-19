import { expect, test, type Page } from '@playwright/test';
import { OWNER, newsletterDocument, restartService, serviceFor, setPlan, signIn, sink, SMTP_LOGIN, waitForMailing } from './helpers';
import { SERVICE_URL } from './stack';

/*
 * The platform screens (S4) and billing (S5) end to end, in a workspace of
 * their own, on the Free plan first and a design partner's plan later.
 *
 * Stateful flows are covered on all four paths of the stateful-flow standard:
 * - CSV import: forward (upload, map, dry run, commit); backtrack (a changed
 *   mapping gives a new dry run, and a commit of an older dry run is refused
 *   with nothing written); resume (a reload during the dry run, and a service
 *   restart once the commit was taken); re-entry (the same file again changes nothing,
 *   a cancelled or failed import stays read-only).
 * - Scheduling: schedule, move, reload, unschedule, and a scheduled mailing
 *   that goes out on its own.
 * - A/B test: set up, change before sending, reload while testing, pick, and a
 *   decided test that can no longer be picked or changed.
 */

test.describe.configure({ mode: 'serial' });

let ws = '';
let templateId = '';
let providerId = '';
let abMailingId = '';
let segmentId = '';

const FORWARD_ROWS = 418;
/** The import file: 418 people, one bad address and one repeated one. */
function forwardCsv(): string {
  const lines = ['Email,First name,Tier'];
  for (let i = 0; i < FORWARD_ROWS; i++) lines.push(`person${i}@example.com,P${i},${i % 4}`);
  lines.push('not-an-address,Nobody,1');
  lines.push('person0@example.com,Again,0');
  return `${lines.join('\n')}\n`;
}
/** Contacts in the forward file tagged workshop with a tier of 2 or more. */
const TIER_2_UP = Array.from({ length: FORWARD_ROWS }, (_, i) => i % 4).filter((t) => t >= 2).length;

function csvFile(name: string, text: string) {
  return { name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') };
}

async function open(page: Page, path: string) {
  await page.goto(`/w/${ws}${path}`);
}

/** Uploads a CSV on the Imports screen and waits for its mapping screen. */
async function upload(page: Page, name: string, text: string) {
  await open(page, '/contacts/imports');
  await page.getByLabel('CSV file').setInputFiles(csvFile(name, text));
  await page.getByRole('button', { name: 'Upload and map' }).click();
  await expect(page).toHaveURL(/\/contacts\/imports\/[^/]+$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

function importIdOf(page: Page): string {
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function mapForward(page: Page, { tag }: { tag: boolean }) {
  await page.getByLabel('What the column Tier holds').selectOption('property:tier');
  await page.getByRole('checkbox', { name: /^News/ }).check();
  if (tag) await page.getByRole('checkbox', { name: 'Workshop' }).check();
  await page.getByRole('checkbox', { name: /Everyone in this file agreed/ }).check();
  await page.getByRole('button', { name: 'Check the file' }).click();
}

test.beforeEach(async ({ page }) => {
  await signIn(page, OWNER);
});

test('setup: a second workspace with a provider, a topic and a template', async () => {
  const created = await serviceFor(OWNER).workspaces.create({
    name: 'E2E Platform',
    slug: 'e2e-platform',
    owner: { email: OWNER.email, name: OWNER.name },
    company_id: OWNER.companies[0]!.id,
  });
  ws = created.id;
  const api = serviceFor(OWNER, ws);
  providerId = (
    await api.providers.create({
      kind: 'smtp',
      name: 'Sink',
      from_name: 'E2E Platform',
      from_email: 'platform@example.com',
      reply_to: null,
      policy: { daily_recipient_budget: 10_000, min_interval_ms: 0, max_recipients_per_message: 1 },
      config: { host: '127.0.0.1', port: (await sink()).port, security: 'tls', username: SMTP_LOGIN.user, password: SMTP_LOGIN.password },
    })
  ).id;
  await api.topics.create({ slug: 'news', name: 'News' });
  templateId = (await api.templates.create({ name: 'Newsletter', document: newsletterDocument('Hello') })).id;
  abMailingId = (await api.mailings.create({ template_id: templateId, subject: 'Which subject wins', topic: 'news', provider_id: providerId })).id;
});

test('billing on Free: usage bars, and buying says billing is not yet available', async ({ page }) => {
  await open(page, '/settings/billing');
  await expect(page.getByTestId('current-plan')).toHaveText('Free');
  await expect(page.getByRole('meter', { name: 'Providers' })).toHaveAttribute('aria-valuetext', /1 of 1 providers, limit reached/);
  await expect(page.getByRole('meter', { name: 'Messages' })).toHaveAttribute('aria-valuetext', /of 1,000 messages/);
  await expect(page.getByTestId('plan-free').getByText('Current')).toBeVisible();

  // Stripe is not configured on this instance: the catalogue says no paid plan
  // is sellable, so the screen says so before anyone clicks.
  await expect(page.getByTestId('billing-unavailable')).toContainText('Billing is not available yet');
  await expect(page.getByTestId('billing-unavailable')).toContainText("Free plan's limits apply");
  await expect(page.getByRole('button', { name: 'Not yet available' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Not yet available' }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Upgrade to/ })).toHaveCount(0);

  // Back from a cancelled checkout: said once, and the address is clean again.
  await open(page, '/settings/billing?checkout=cancelled');
  await expect(page.getByTestId('checkout-return')).toContainText('Checkout was cancelled. Nothing was charged');
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/settings/billing$`));
  await page.reload();
  await expect(page.getByTestId('checkout-return')).toHaveCount(0);
});

test('plan limits: what the plan lacks is off up front, and a limit hit on saving links to Billing', async ({ page }) => {
  // Tracking is not in Free: the switches are off, and the screen says why.
  await open(page, '/settings');
  await expect(page.getByLabel('Track opens')).toBeDisabled();
  await expect(page.getByLabel('Track clicks')).toBeDisabled();
  const gate = page.getByTestId('plan-gate');
  await expect(gate).toContainText('The Free plan does not include open and click tracking.');
  await gate.getByRole('link', { name: 'See plans and usage' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/settings/billing$`));

  // Neither are A/B tests.
  await open(page, `/mailings/${abMailingId}`);
  await expect(page.getByRole('button', { name: 'Set up an A/B test' })).toBeDisabled();
  await expect(page.getByTestId('plan-gate')).toContainText('The Free plan does not include A/B tests.');

  // A counted limit is met on saving: Free has one webhook endpoint.
  await open(page, '/settings/webhooks');
  for (const url of ['http://localhost:9/first', 'http://localhost:9/second']) {
    await page.getByRole('button', { name: 'Add endpoint' }).first().click();
    await page.getByLabel('Endpoint URL').fill(url);
    await page.getByRole('button', { name: 'Add endpoint' }).last().click();
    if (url.endsWith('first')) {
      await expect(page.getByTestId('secret-value')).toContainText('whsec_');
      await page.getByRole('button', { name: 'I have stored it' }).click();
    }
  }
  const refusal = page.getByRole('alert').filter({ hasText: /Free plan allows 1 webhook/ });
  await expect(refusal).toBeVisible();
  await refusal.getByRole('link', { name: 'See plans and usage' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/settings/billing$`));
});

test('tags and typed properties', async ({ page }) => {
  await open(page, '/contacts/tags');
  await expect(page.getByText('No tags yet')).toBeVisible();
  await page.getByLabel('New tag').fill('Workshop');
  await expect(page.getByLabel('Slug')).toHaveValue('workshop');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByRole('cell', { name: 'Workshop', exact: true })).toBeVisible();
  // A slug that is taken is refused with the reason.
  await page.getByLabel('New tag').fill('Workshop');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible();

  await open(page, '/contacts/properties');
  await page.getByLabel('Label').fill('Tier');
  await expect(page.getByLabel('Key')).toHaveValue('tier');
  await page.getByLabel('Type').selectOption('number');
  await page.getByRole('button', { name: 'Define property' }).click();
  await expect(page.getByRole('cell', { name: 'tier', exact: true })).toBeVisible();
});

test('import, forward: upload, map, dry run, commit; the contacts count toward the plan', async ({ page }) => {
  await upload(page, 'people.csv', forwardCsv());
  await expect(page.getByTestId('import-status')).toHaveText('Needs mapping');
  // The suggested mapping found the email column by its header.
  await expect(page.getByLabel('What the column Email holds')).toHaveValue('email');
  await mapForward(page, { tag: true });

  const dryRun = page.getByTestId('dry-run');
  await expect(dryRun).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('import-status')).toHaveText('Ready to import');
  await expect(dryRun.getByTestId('report-created')).toHaveText(String(FORWARD_ROWS));
  await expect(dryRun.getByTestId('report-skipped')).toHaveText('2');
  await expect(dryRun).toContainText('not a valid email address (1)');
  await expect(dryRun).toContainText('the address appears earlier in the file (1)');
  // The rows of the dry run that just finished on this page, without a reload.
  await expect(page.getByRole('table', { name: 'Rows of the file' }).getByRole('row')).toHaveCount(51);
  // Nothing is written by a dry run.
  expect((await serviceFor(OWNER, ws).contacts.list({ limit: 1 })).data).toHaveLength(0);

  await page.getByRole('button', { name: `Import ${FORWARD_ROWS} contacts` }).click();
  await expect(page.getByTestId('import-status')).toHaveText('Imported', { timeout: 60_000 });
  await expect(page.getByTestId('import-result').getByTestId('report-created')).toHaveText(String(FORWARD_ROWS));
  const person = (await serviceFor(OWNER, ws).contacts.list({ email: 'person3@example.com' })).data[0]!;
  expect(person).toMatchObject({ first_name: 'P3', topics: ['news'], tags: ['workshop'], properties: { tier: 3 } });

  // 418 of 500 contacts is past 80 percent: every page of the workspace says so.
  await open(page, '/contacts');
  await expect(page.getByTestId('usage-banner')).toContainText(`${FORWARD_ROWS} of 500 contacts`);
  await page.getByTestId('usage-banner').getByRole('link', { name: 'Plans and usage' }).click();
  await expect(page.getByRole('meter', { name: 'Contacts' })).toHaveAttribute('aria-valuetext', /close to the limit/);
  // The Billing screen shows the numbers itself, so it has no banner.
  await expect(page.getByTestId('usage-banner')).toHaveCount(0);
});

test('import, backtrack: a new mapping means a new dry run, and an older one cannot be committed', async ({ page }) => {
  const small = 'Email,First name\nnew1@example.com,N1\nnew2@example.com,N2\nnew3@example.com,N3\n';
  await upload(page, 'three.csv', small);
  await page.getByRole('checkbox', { name: /^News/ }).check();
  await page.getByRole('checkbox', { name: /Everyone in this file agreed/ }).check();
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByTestId('dry-run').getByTestId('report-created')).toHaveText('3', { timeout: 30_000 });
  await expect(page.getByText('mapping 1')).toBeVisible();

  // Revise: tag them too. The form starts from the current mapping.
  await page.getByRole('button', { name: 'Change the mapping' }).click();
  await expect(page.getByRole('checkbox', { name: /^News/ })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Workshop' }).check();
  await page.getByRole('checkbox', { name: /Everyone in this file agreed/ }).check();
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByText('mapping 2')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('dry-run').getByTestId('report-created')).toHaveText('3');

  // Someone else changes the mapping while this page shows version 2.
  const id = importIdOf(page);
  const api = serviceFor(OWNER, ws);
  await api.imports.setMapping(id, { mapping: { Email: 'email', 'First name': 'ignore' }, topics: ['news'], tags: [], consent_confirmed: true });
  await expect.poll(async () => (await api.imports.get(id)).status, { timeout: 30_000 }).toBe('validated');
  await page.getByRole('button', { name: 'Import 3 contacts' }).click();
  await expect(page.getByText(/Nothing was imported\. The mapping changed since version 2/)).toBeVisible();
  await expect(page.getByText('mapping 3')).toBeVisible();
  expect((await api.contacts.list({ email: 'new1@example.com' })).data).toHaveLength(0);

  // The current dry run commits.
  await page.getByRole('button', { name: 'Import 3 contacts' }).click();
  await expect(page.getByTestId('import-status')).toHaveText('Imported', { timeout: 60_000 });
  expect((await api.contacts.list({ email: 'new1@example.com' })).data[0]).toMatchObject({ first_name: null, tags: [] });
});

test('import, resume and re-entry: a reload mid-run resumes; the same file again changes nothing; a cancel is final', async ({ page }) => {
  await upload(page, 'people.csv', forwardCsv());
  await mapForward(page, { tag: true });
  // Resume from persistence: the page is rebuilt from the service, whatever the dry run's progress.
  await page.reload();
  await expect(page.getByTestId('import-status')).toHaveText('Ready to import', { timeout: 30_000 });
  const dryRun = page.getByTestId('dry-run');
  await expect(dryRun.getByTestId('report-unchanged')).toHaveText(String(FORWARD_ROWS));
  await expect(dryRun.getByTestId('report-created')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Import 0 contacts' })).toBeDisabled();
  await expect(page.getByText('Nothing to import: every row is already up to date or left out.')).toBeVisible();
  // The rows say why, row by row.
  const rows = page.getByRole('table', { name: 'Rows of the file' });
  // Retried: in the dev server a choice made before the page hydrated is not seen.
  await expect(async () => {
    await page.getByLabel('Show').selectOption('skipped');
    await expect(rows.getByRole('row')).toHaveCount(3, { timeout: 2_000 });
  }).toPass();
  await expect(rows).toContainText('not-an-address');

  await page.getByRole('button', { name: 'Cancel import' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.getByTestId('import-status')).toHaveText('Cancelled');
  await page.reload();
  await expect(page.getByText('This import is closed; upload the file again to start over.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel import' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check the file' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Import / })).toHaveCount(0);
});

test('segments: a filter with a live count, saved, changed and saved again', async ({ page }) => {
  await open(page, '/contacts/segments');
  await page.getByRole('link', { name: 'New segment' }).first().click();
  await page.getByLabel('Name').fill('Workshop, tier 2 and up');
  const conditions = page.getByTestId('segment-condition');
  await conditions.nth(0).getByLabel('Field').selectOption('tag');
  await conditions.nth(0).getByLabel('Value').selectOption('workshop');
  await page.getByRole('button', { name: 'Add condition' }).click();
  await conditions.nth(1).getByLabel('Field').selectOption('property:tier');
  await conditions.nth(1).getByLabel('Comparison').selectOption('gte');
  // Incomplete: no count, no save.
  await expect(page.getByText('Complete the conditions to see who matches.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create segment' })).toBeDisabled();
  await conditions.nth(1).getByLabel('Value').fill('2');
  await expect(page.getByTestId('segment-count')).toHaveText(String(TIER_2_UP));
  await page.getByRole('button', { name: 'Create segment' }).click();
  await expect(page).toHaveURL(/\/contacts\/segments\/[^/]+$/);
  // The saved segment's own page, not the builder that is being replaced.
  await expect(page.getByRole('heading', { name: 'Workshop, tier 2 and up' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save segment' })).toBeVisible();
  segmentId = new URL(page.url()).pathname.split('/').pop()!;

  // Backtrack: "any of" widens it; the count follows before saving, and the saved one after a reload.
  await page.getByLabel('How the conditions combine').selectOption({ label: 'any of' });
  await expect(page.getByTestId('segment-count')).toHaveText(String(FORWARD_ROWS));
  await page.getByLabel('How the conditions combine').selectOption({ label: 'all of' });
  await expect(page.getByTestId('segment-count')).toHaveText(String(TIER_2_UP));
  await page.getByRole('button', { name: 'Save segment' }).click();
  await page.reload();
  await expect(page.getByLabel('How the conditions combine')).toHaveValue('0');
  await open(page, '/contacts/segments');
  await expect(page.getByRole('row', { name: new RegExp(`Workshop, tier 2 and up.*${TIER_2_UP}`) })).toBeVisible();
});

test('mailing: a segment as the audience, the usage header after a test, and scheduling on all four paths', async ({ page }) => {
  test.setTimeout(240_000);
  const api = serviceFor(OWNER, ws);
  const mailing = await api.mailings.create({ template_id: templateId, subject: 'For the workshop', topic: 'news', provider_id: providerId });
  await open(page, `/mailings/${mailing.id}`);
  await page.getByLabel('Segment', { exact: true }).selectOption(segmentId);
  await page.getByRole('button', { name: 'Add its contacts' }).click();
  await expect(page.getByTestId('segment-result')).toContainText(`${TIER_2_UP} added`);
  // Again: nobody twice.
  await page.getByRole('button', { name: 'Add its contacts' }).click();
  await expect(page.getByTestId('segment-result')).toContainText(`0 added, ${TIER_2_UP} already on the list`);

  // The test's response carries x-mail-usage-warning (contacts past 80 percent), shown right there.
  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByTestId('usage-warning')).toContainText('of 500 contacts');

  // Forward: schedule.
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByTestId('mailing-status')).toHaveText('Scheduled');
  await expect(page.getByTestId('scheduled-for')).toBeVisible();
  const first = (await api.mailings.get(mailing.id)).scheduled_at;

  // Backtrack: move it, then take it back to a draft.
  await page.getByRole('button', { name: 'Change time' }).click();
  const later = new Date(Date.now() + 26 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page.getByLabel('Send at').fill(`${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect.poll(async () => (await api.mailings.get(mailing.id)).scheduled_at).not.toBe(first);

  // Resume: a reload shows the schedule from the service.
  await page.reload();
  await expect(page.getByTestId('mailing-status')).toHaveText('Scheduled');
  await open(page, '/mailings?status=scheduled');
  await expect(page.getByRole('row', { name: /For the workshop.*for / })).toBeVisible();
  await open(page, `/mailings/${mailing.id}`);
  await page.getByRole('button', { name: 'Unschedule' }).click();
  await expect(page.getByTestId('mailing-status')).toHaveText('Draft');
  await expect(page.getByTestId('scheduled-for')).toHaveCount(0);

  // Re-entry: scheduled a few seconds out, it goes on its own while the page watches.
  await api.mailings.schedule(mailing.id, { send_at: new Date(Date.now() + 4_000).toISOString() });
  await page.reload();
  await expect(page.getByTestId('mailing-status')).toHaveText(/Sending|Sent/, { timeout: 60_000 });
  const done = await waitForMailing(OWNER, ws, mailing.id, ['sent'], 120_000);
  expect(done.counts.sent).toBe(TIER_2_UP);
  await expect(page.getByTestId('mailing-status')).toHaveText('Sent', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Schedule', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('analytics')).toContainText('not tracked for this mailing');
});

test('design partner: exempt billing, tracking on, and an A/B test on all four paths', async ({ page }) => {
  test.setTimeout(240_000);
  // Back from a checkout, the screen waits for the plan to change (Stripe's
  // webhook sets it; here an operator does), then says it did, once.
  await open(page, '/settings/billing?checkout=success');
  await expect(page.getByTestId('checkout-return')).toContainText('Your upgrade is being confirmed');
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/settings/billing$`));
  await setPlan(ws, 'design_partner');
  await expect(page.getByTestId('checkout-return')).toContainText('Your plan is now Design partner.', { timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId('checkout-return')).toHaveCount(0);
  await expect(page.getByTestId('current-plan')).toHaveText('Design partner');
  await expect(page.getByText('A design partner outside billing: no limits and nothing to pay.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plans' })).toHaveCount(0);
  await expect(page.getByRole('meter', { name: 'Contacts' })).toHaveAttribute('aria-valuetext', /no limit/);

  await open(page, '/settings');
  await page.getByLabel('Track opens').check();
  await page.getByLabel('Track clicks').check();
  await page.getByRole('button', { name: 'Save tracking' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  expect(await serviceFor(OWNER, ws).tracking.get()).toEqual({ opens: true, clicks: true });
  // Engagement is now something a segment can filter on.
  await open(page, '/contacts/segments/new');
  await page.getByTestId('segment-condition').first().getByLabel('Field').selectOption('engagement:opened');
  await expect(page.getByTestId('segment-condition').first().getByLabel('Comparison')).toHaveValue('lte');

  const api = serviceFor(OWNER, ws);
  await api.mailings.addRecipients(abMailingId, { recipients: ['ab1', 'ab2', 'ab3', 'ab4'].map((n) => ({ email: `${n}@example.com` })) });
  await open(page, `/mailings/${abMailingId}`);
  // Forward: set up.
  await page.getByRole('button', { name: 'Set up an A/B test' }).click();
  await page.getByLabel('Subject of variant B').fill('Subject B');
  await page.getByLabel('Content of variant B').selectOption({ label: 'Newsletter (v1)' });
  await page.getByLabel('Test group').fill('50');
  await page.getByLabel('The winner is').selectOption('manual');
  await page.getByRole('button', { name: 'Save the test' }).click();
  const ab = page.getByTestId('ab-test');
  await expect(ab).toContainText('Set up');
  await expect(ab.getByRole('table', { name: 'Variants' }).getByRole('row')).toHaveCount(3);

  await expect(ab.getByRole('row', { name: /b.*Subject B.*its own content/i })).toBeVisible();

  // Backtrack: a third variant, then back to two. B's own content is kept
  // by default, without being chosen again.
  await page.getByRole('button', { name: 'Change the test' }).click();
  await expect(page.getByLabel('Content of variant B')).toHaveValue('keep');
  await page.getByRole('button', { name: 'Add a variant' }).click();
  await page.getByLabel('Subject of variant C').fill('Subject C');
  await page.getByRole('button', { name: 'Save the test' }).click();
  await expect(ab.getByRole('table', { name: 'Variants' }).getByRole('row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Change the test' }).click();
  await page.getByRole('button', { name: 'Remove variant C' }).click();
  await page.getByRole('button', { name: 'Save the test' }).click();
  await expect(ab.getByRole('table', { name: 'Variants' }).getByRole('row')).toHaveCount(3);
  await expect(ab.getByRole('row', { name: /b.*Subject B.*its own content/i })).toBeVisible();

  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Send to 4 recipients' }).click();
  // The test group goes; the rest waits for a pick.
  await expect.poll(async () => (await api.mailings.get(abMailingId)).ab_test?.status, { timeout: 60_000 }).toMatch(/testing|awaiting_pick/);
  // Resume: after a reload the pick is still offered.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Send B to the rest' })).toBeVisible();
  await page.getByRole('button', { name: 'Send B to the rest' }).click();
  // The pick is confirmed with the numbers: 2 in the test group, 2 waiting.
  const confirmPick = page.getByRole('dialog');
  await expect(confirmPick).toContainText('the other 2 of 4 recipients');
  await confirmPick.getByRole('button', { name: 'Send B to 2 recipients' }).click();
  await expect(ab).toContainText('Decided');
  await expect(ab.getByRole('row', { name: /b.*winner/i })).toBeVisible();
  const done = await waitForMailing(OWNER, ws, abMailingId, ['sent'], 120_000);
  expect(done.counts.sent).toBe(4);
  expect((await sink()).messages.filter((m) => /^ab\d@/.test(m.to[0] ?? '') && m.raw.includes('Subject B')).length).toBeGreaterThanOrEqual(3);

  // Re-entry: decided and sent, nothing to pick or change; the results are per variant.
  await page.reload();
  await expect(page.getByRole('button', { name: /to the rest/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change the test' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Results per variant' })).toBeVisible();
});

test('signup form: created, embedded, confirmed by a person, changed and deleted', async ({ page, browser }) => {
  await open(page, '/contacts/forms');
  await page.getByRole('link', { name: 'New form' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('Website footer');
  await page.getByLabel('Heading of the page').fill('Stay in touch');
  await page.getByLabel('What people agree to', { exact: true }).fill('I would like the newsletter.');
  await page.getByRole('checkbox', { name: /^News/ }).check();
  await page.getByRole('checkbox', { name: 'Workshop' }).check();
  await page.getByLabel('Heading in German').fill('Bleiben Sie dran');
  await page.getByLabel('What people agree to, in German').fill('Ich möchte den Newsletter.');
  await page.getByRole('button', { name: 'Create form' }).click();
  await expect(page).toHaveURL(/\/contacts\/forms\/[^/]+$/);
  const hosted = (await page.locator('code').first().textContent())!.trim();
  expect(hosted.startsWith(SERVICE_URL.replace('127.0.0.1', 'localhost'))).toBe(true);
  await expect(page.getByText('Embed markup')).toBeVisible();

  // A visitor subscribes on the hosted page; nothing happens until the link is followed.
  const visitor = await browser.newContext({ locale: 'en-GB' });
  const v = await visitor.newPage();
  await v.goto(hosted);
  await expect(v.getByRole('heading', { name: 'Stay in touch' })).toBeVisible();
  await v.getByLabel('Email address').fill('visitor@example.com');
  // The page refuses a form filled faster than a person could (three seconds).
  await v.waitForTimeout(3_500);
  await v.getByRole('button', { name: 'Subscribe' }).click();
  const api = serviceFor(OWNER, ws);
  expect((await api.contacts.list({ email: 'visitor@example.com' })).data[0]?.topics ?? []).toEqual([]);
  let confirmUrl = '';
  await expect
    .poll(async () => {
      const mail = (await sink()).messages.find((m) => m.to.includes('visitor@example.com'));
      const match = mail ? /https?:\/\/[^\s"<>]+\/f\/confirm\/[A-Za-z0-9._~-]+/.exec(mail.raw.replace(/=\r?\n/g, '').replace(/=3D/g, '=')) : null;
      confirmUrl = match ? match[0] : '';
      return confirmUrl;
    })
    .not.toBe('');
  await v.goto(confirmUrl);
  await v.getByRole('button', { name: 'Confirm subscription' }).click();
  await expect.poll(async () => (await api.contacts.list({ email: 'visitor@example.com' })).data[0]).toMatchObject({ topics: ['news'], tags: ['workshop'] });
  await visitor.close();

  // A change is a new version.
  await page.getByLabel('Heading of the page').fill('Stay in the loop');
  await page.getByRole('button', { name: 'Save form' }).click();
  await expect(page.getByText(/^Version 2;/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Heading of the page')).toHaveValue('Stay in the loop');
  await expect(page.getByText(/^Version 2;/)).toBeVisible();

  await page.getByRole('button', { name: 'Delete form' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete form' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/contacts/forms$`));
  await expect(page.getByText('No signup forms yet')).toBeVisible();
});

test('import, failed at the plan limit across a restart: what was written stays, the rest is read-only', async ({ page }) => {
  test.setTimeout(240_000);
  await setPlan(ws, 'free');
  const lines = ['Email'];
  for (let i = 0; i < 700; i++) lines.push(`extra${i}@example.com`);
  await upload(page, 'too-many.csv', `${lines.join('\n')}\n`);
  await page.getByRole('checkbox', { name: /Everyone in this file agreed/ }).check();
  await page.getByRole('button', { name: 'Check the file' }).click();
  await expect(page.getByRole('button', { name: 'Import 700 contacts' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Import 700 contacts' }).click();
  // Once the service took the commit, it restarts (a deploy); the worker picks
  // the import up again, and it stops at the contact limit.
  const id = importIdOf(page);
  const api = serviceFor(OWNER, ws);
  await expect.poll(async () => (await api.imports.get(id)).status, { timeout: 30_000 }).toMatch(/committing|failed/);
  await restartService('SIGTERM');
  await page.reload();
  await expect(page.getByTestId('import-status')).toHaveText('Failed', { timeout: 90_000 });
  await expect(page.getByText(/contact limit was reached/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel import' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Import / })).toHaveCount(0);
  await open(page, '/contacts');
  // The failed batch was rolled back whole, so the count is where it was.
  await expect(page.getByTestId('usage-banner')).toContainText('close to the limits of its plan');
});
