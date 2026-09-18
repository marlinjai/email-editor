import { expect, test, type Page } from '@playwright/test';
import { REMOTE_IMAGE_URL } from './stack';
import { EDITOR, OWNER, configureSink, newsletterDocument, restartService, serviceFor, signIn, sink, SMTP_LOGIN, waitForMailing, workspaceIdOf } from './helpers';

/*
 * The dashboard end to end, in the order a new customer meets it. One serial
 * run over one database: each step builds on the previous one, as a person's
 * session would. The mailing flow is covered on all four paths of the
 * stateful-flow standard: forward, backtrack and revise, resume from
 * persistence (a reload and a service restart mid-send), and re-entry after
 * completion or failure (retry, duplicate, a cancelled mailing).
 */

test.describe.configure({ mode: 'serial' });

let ws = '';
let templateId = '';
let smtpPort = 0;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function open(page: Page, path: string) {
  await page.goto(`/w/${ws}${path}`);
}

async function status(page: Page) {
  return page.getByTestId('mailing-status');
}

test.beforeEach(async ({ page }) => {
  await signIn(page, OWNER);
});

test('first run: a new person creates a workspace for their company', async ({ page }) => {
  smtpPort = (await sink()).port;
  await page.goto('/');
  await expect(page).toHaveURL(/\/workspaces\/new\?first=1/);
  await expect(page.getByRole('heading', { name: 'Create your first workspace' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('E2E News');
  await expect(page.getByLabel('Slug')).toHaveValue('e2e-news');
  await expect(page.getByText('E2E Company')).toBeVisible();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+$/);
  ws = workspaceIdOf(page);
  await expect(page.getByRole('heading', { name: 'Before the first mailing' })).toBeVisible();

  // The workspace is keyed to the signed-in company, for auth-brain's erasure.
  const mine = await serviceFor(OWNER).workspaces.list();
  expect(mine.data).toEqual([expect.objectContaining({ id: ws, slug: 'e2e-news', company_id: 'tenant-e2e', role: 'owner' })]);

  // A slug that is taken is refused with a readable reason.
  await page.goto('/workspaces/new');
  await page.getByLabel('Name', { exact: true }).fill('E2E News');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'already exists' })).toBeVisible();

  // A workspace that is not the person's is a clean "not yours", not someone else's data.
  await page.goto('/w/00000000-0000-0000-0000-000000000000');
  await expect(page.getByRole('heading', { name: 'Not a workspace of yours' })).toBeVisible();
});

test('settings: a provider with a write-only secret, verified against the SMTP sink', async ({ page }) => {
  await open(page, '/settings/providers');
  await expect(page.getByText('No provider yet')).toBeVisible();
  await page.getByRole('button', { name: 'Add provider' }).first().click();
  await page.getByRole('button', { name: 'Other SMTP' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Sink');
  await page.getByLabel('Sender name').fill('E2E News');
  await page.getByLabel('Sender address').fill('news@example.com');
  await page.getByLabel('SMTP host').fill('127.0.0.1');
  await page.getByLabel('Port').fill(String(smtpPort));
  await page.getByLabel('Encryption').selectOption('tls');
  await page.getByLabel('User name').fill(SMTP_LOGIN.user);
  await page.getByLabel('Password').fill(SMTP_LOGIN.password);
  await page.getByLabel('Milliseconds between messages').fill('0');
  await page.getByRole('button', { name: 'Add provider' }).click();
  await expect(page.getByText('Credential stored')).toBeVisible();

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Connected and authenticated')).toBeVisible();
  // The secret never comes back to the browser.
  expect(await page.content()).not.toContain(SMTP_LOGIN.password);

  // Editing without typing a password keeps the stored one.
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Password')).toHaveValue('');
  await page.getByLabel('Sender name').fill('E2E Newsletter');
  await page.getByRole('button', { name: 'Save provider' }).click();
  await expect(page.getByText('E2E Newsletter')).toBeVisible();
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Connected and authenticated')).toBeVisible();
  await expect(page.getByText(/0 of 1,000 recipients/)).toBeVisible();
});

test('settings: languages, a translated topic, an API key shown once, a webhook', async ({ page }) => {
  await open(page, '/settings');
  await page.getByLabel('Languages of the unsubscribe page').fill('en, de');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  await open(page, '/settings/topics');
  await page.getByRole('button', { name: 'New topic' }).first().click();
  await page.getByLabel('Name (en)').fill('News');
  await expect(page.getByLabel('Slug')).toHaveValue('news');
  await page.getByLabel('Name in de').fill('Neuigkeiten');
  await page.getByRole('button', { name: 'Create topic' }).click();
  await expect(page.getByRole('heading', { name: 'News', exact: true })).toBeVisible();
  const topics = await serviceFor(OWNER, ws).topics.list();
  expect(topics.data[0]).toMatchObject({ slug: 'news', translations: { de: { name: 'Neuigkeiten' } } });

  await open(page, '/settings/api-keys');
  await page.getByLabel('Name').fill('CI key');
  await page.getByRole('button', { name: 'Create key' }).click();
  const secret = (await page.getByTestId('secret-value').textContent())!.trim();
  expect(secret.length).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'I have stored it' }).click();
  await expect(page.getByRole('cell', { name: 'CI key' })).toBeVisible();
  await page.reload();
  expect(await page.content()).not.toContain(secret);
  await page.getByRole('button', { name: 'Revoke' }).click();
  await page.getByLabel(/Type .* to confirm/).fill('CI key');
  await page.getByRole('button', { name: 'Revoke key' }).click();
  await expect(page.getByRole('heading', { name: 'Revoked keys' })).toBeVisible();

  await open(page, '/settings/webhooks');
  await page.getByRole('button', { name: 'Add endpoint' }).first().click();
  await page.getByLabel('Endpoint URL').fill('http://localhost:9/mail-events');
  await page.getByRole('button', { name: 'Add endpoint' }).last().click();
  await expect(page.getByTestId('secret-value')).toContainText('whsec_');
  await page.getByRole('button', { name: 'I have stored it' }).click();
  await page.getByText('http://localhost:9/mail-events').click();
  await expect(page.getByText('No deliveries yet')).toBeVisible();
});

test('templates: the editor saves, a concurrent save is caught, an image uploads, history restores', async ({ page }) => {
  const api = serviceFor(OWNER, ws);
  templateId = (await api.templates.create({ name: 'Newsletter', document: newsletterDocument('Hello') })).id;

  await open(page, '/templates');
  await page.getByRole('link', { name: 'Newsletter' }).click();
  const title = page.getByLabel('Template name');
  await expect(title).toHaveValue('Newsletter');
  await expect(page.locator('[data-block-id="txt-1"]')).toBeVisible();

  await title.fill('Newsletter v2');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByTestId('save-template').click();
  await expect(page.getByText('Saved as v2')).toBeVisible();

  // Someone saves in the meantime: the next save is refused and the person chooses.
  await api.templates.update(templateId, { base_version: 2, name: 'Changed elsewhere' });
  await title.fill('Mine');
  await page.getByTestId('save-template').click();
  await expect(page.getByRole('heading', { name: 'Someone else saved this template' })).toBeVisible();
  await page.getByRole('button', { name: 'Load their version' }).click();
  await expect(title).toHaveValue('Changed elsewhere');
  await expect(page.getByText('v3', { exact: true })).toBeVisible();

  // An image through the editor's hook, uploaded to the workspace's assets.
  await page.locator('[data-block-id="img-1"]').click();
  await page.getByRole('button', { name: /Choose image|Replace image/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose an image' })).toBeVisible();
  await page.getByLabel('Upload').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Upload and use' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an image' })).toBeHidden();
  await page.getByTestId('save-template').click();
  await expect(page.getByText('Saved as v4')).toBeVisible();
  expect(JSON.stringify((await api.templates.get(templateId)).document)).toMatch(/\/a\/[0-9a-f-]+/);

  // The preview is the compiled email in a fully sandboxed frame.
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const frame = page.locator('iframe[title="Email preview"]');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(frame.contentFrame().getByText('Hello,')).toBeVisible();

  // History: restoring version 1 saves it again as the newest version.
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('button', { name: /^v1/ }).click();
  await expect(page.locator('iframe[title="Version 1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Restore this version' }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Restored as version 5.')).toBeVisible();
  expect((await api.templates.get(templateId)).version).toBe(5);
});

test('asset policy: a service_only workspace imports a remote image before the mail can go out', async ({ page }) => {
  await open(page, '/settings');
  await page.getByLabel('Only from Lumitra Mail').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  const api = serviceFor(OWNER, ws);
  expect((await api.workspace.get()).settings.asset_policy).toBe('service_only');

  const doc = {
    version: '1.0' as const,
    metadata: { title: 'Remote' },
    sections: [
      {
        id: 'sec-1',
        type: 'section',
        columns: [
          {
            id: 'col-1',
            blocks: [
              { id: 'img-r', type: 'image', src: REMOTE_IMAGE_URL, alt: 'Logo', width: '40px', align: 'center' },
              { id: 'txt-r', type: 'text', content: '<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
            ],
          },
        ],
      },
    ],
  };
  const remote = await api.templates.create({ name: 'Remote image', document: doc });
  try {
    await open(page, `/templates/${remote.id}`);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByText(REMOTE_IMAGE_URL, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Import into assets' }).click();
    // The document now points at the imported copy, and the preview compiles clean.
    await expect(page.getByRole('button', { name: 'Import into assets' })).toHaveCount(0);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByTestId('save-template').click();
    await expect(page.getByText('Saved as v2')).toBeVisible();
    const saved = JSON.stringify((await api.templates.get(remote.id)).document);
    expect(saved).not.toContain(REMOTE_IMAGE_URL);
    expect(saved).toMatch(/\/a\/[0-9a-f-]+/);
    expect((await api.templates.compile(remote.id)).errors).toEqual([]);
  } finally {
    // The later flows use an inline image, which service_only refuses.
    await api.workspace.update({ settings: { asset_policy: 'any' } });
  }
});

test('mailing, forward: compose, add recipients, test, send, see it in the archive', async ({ page }) => {
  // Version 5 restored the document without the uploaded image; either is sendable.
  await open(page, `/mailings/new?template=${templateId}`);
  await page.getByLabel('Subject').fill('Hello subscribers');
  await page.getByRole('button', { name: 'Create mailing' }).click();
  await expect(page).toHaveURL(/\/mailings\/[^/]+$/);
  await expect(await status(page)).toHaveText('Draft');

  await page.getByLabel('Addresses').fill('ana@example.com, Ana\nben@example.com, Ben\nnot-an-address\nana@example.com');
  await expect(page.getByText('2 addresses ready, 2 lines skipped.')).toBeVisible();
  await page.getByRole('button', { name: 'Add 2 recipients' }).click();
  await expect(page.getByTestId('add-result')).toContainText('Added 2. 0 already on this mailing');
  await page.getByLabel('Addresses').fill('ana@example.com');
  await page.getByRole('button', { name: 'Add 1 recipients' }).click();
  await expect(page.getByTestId('add-result')).toContainText('Added 0. 1 already on this mailing');

  await page.getByLabel('First name to merge (optional)').fill('Tess');
  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByTestId('last-test')).toContainText('owner@example.com');
  await expect(page.getByTestId('last-test')).toContainText('sent');
  await expect.poll(async () => (await sink()).messages.some((m) => m.to.includes('owner@example.com') && m.raw.includes('Tess'))).toBe(true);

  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Send to 2 recipients' }).click();
  await expect(await status(page)).toHaveText(/Sending|Sent/);
  await expect(await status(page)).toHaveText('Sent', { timeout: 60_000 });
  const delivered = (await sink()).messages;
  expect(delivered.some((m) => m.to.includes('ana@example.com') && m.raw.includes('Ana'))).toBe(true);
  expect(delivered.some((m) => m.to.includes('ben@example.com') && m.raw.includes('Ben'))).toBe(true);

  await page.goto(`/w/${ws}/archive?outcome=sent`);
  await page.getByRole('link', { name: 'ana@example.com' }).first().click();
  const frame = page.locator('iframe[title="Message to ana@example.com"]');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(frame.contentFrame().getByText('Hello, Ana!')).toBeVisible();
});

test('mailing, backtrack: a change after a test marks it out of date; template edits never reach the snapshot', async ({ page }) => {
  const api = serviceFor(OWNER, ws);
  await api.templates.update(templateId, { base_version: 5, document: newsletterDocument('Hello') });
  await open(page, `/mailings/new?template=${templateId}`);
  await page.getByLabel('Subject').fill('Draft to revise');
  await page.getByRole('button', { name: 'Create mailing' }).click();
  await expect(page).toHaveURL(/\/mailings\/[^/]+$/);

  await page.getByRole('button', { name: 'Send test' }).click();
  await expect(page.getByTestId('last-test')).toContainText('sent');
  await expect(page.getByTestId('last-test')).not.toContainText('changed since');

  await page.getByLabel('Subject').fill('Draft, revised');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByTestId('last-test')).toContainText('changed since');

  // The template moves on; the mailing keeps its copy until asked.
  const current = await api.templates.get(templateId);
  await api.templates.update(templateId, { base_version: current.version, document: newsletterDocument('Changed') });
  await page.reload();
  const preview = page.locator('iframe[title="Preview of Draft, revised"]');
  await expect(preview.contentFrame().getByText('Hello,')).toBeVisible();
  await page.getByRole('button', { name: 'Use its current version' }).click();
  await expect(page.locator('iframe[title="Preview of Draft, revised"]').contentFrame().getByText('Changed,')).toBeVisible();
});

test('mailing, resume: a reload shows live progress, and a restart of the service mid-send still finishes it', async ({ page }) => {
  const api = serviceFor(OWNER, ws);
  const providers = await api.providers.list();
  const mailing = await api.mailings.create({ template_id: templateId, subject: 'Slow one', topic: 'news', provider_id: providers.data[0]!.id });
  await api.mailings.addRecipients(mailing.id, {
    recipients: Array.from({ length: 12 }, (_, i) => ({ email: `slow${i}@example.com`, merge: { first_name: `S${i}` } })),
  });
  await configureSink({ delayMs: 500 });
  try {
    await open(page, `/mailings/${mailing.id}`);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Send to 12 recipients' }).click();
    await expect(await status(page)).toHaveText('Sending');
    await expect.poll(async () => (await sink()).messages.filter((m) => m.to[0]?.startsWith('slow')).length).toBeGreaterThanOrEqual(2);

    // Resume from persistence: the page is rebuilt from the service's state.
    await page.reload();
    await expect(await status(page)).toHaveText('Sending');
    const rail = page.getByRole('progressbar', { name: 'Sending progress' });
    await expect.poll(async () => Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(0);

    // The service is restarted mid-send, as a deploy does (SIGTERM: the worker
    // finishes the message in flight, stops, and the new process carries on).
    // A hard crash leaves a row "sending" that the worker settles only after its
    // 15-minute stuck window; the service's own sending-flow suite covers that.
    await restartService('SIGTERM');
    const done = await waitForMailing(OWNER, ws, mailing.id, ['sent', 'partially_failed'], 90_000);
    expect(done.counts.sent + done.counts.failed + done.counts.skipped).toBe(12);
    await expect(await status(page)).toHaveText(/Sent|Partly failed/, { timeout: 30_000 });
  } finally {
    await configureSink({ delayMs: 0 });
  }
});

test('mailing, re-entry: retry the failed, duplicate a sent mailing, a cancelled one is read-only', async ({ page }) => {
  const api = serviceFor(OWNER, ws);
  const providers = await api.providers.list();
  const mailing = await api.mailings.create({ template_id: templateId, subject: 'With a bounce', topic: 'news', provider_id: providers.data[0]!.id });
  await api.mailings.addRecipients(mailing.id, { recipients: [{ email: 'fine@example.com' }, { email: 'bounce@example.com' }] });
  await configureSink({ reject: ['bounce@example.com'] });
  try {
    await open(page, `/mailings/${mailing.id}`);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('button', { name: 'Send to 2 recipients' }).click();
    await expect(await status(page)).toHaveText('Partly failed', { timeout: 60_000 });
  } finally {
    await configureSink({ reject: [] });
  }
  await page.getByRole('button', { name: 'Retry failed' }).click();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(await status(page)).toHaveText('Sent', { timeout: 60_000 });
  expect((await sink()).messages.some((m) => m.to.includes('bounce@example.com'))).toBe(true);

  // Duplicate: a new draft with the same content and no recipients.
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).not.toHaveURL(new RegExp(mailing.id));
  await expect(await status(page)).toHaveText('Draft');
  await expect(page.getByLabel('Subject')).toHaveValue('With a bounce');
  await expect(page.getByText('No recipients yet')).toBeVisible();

  // Cancelling it leaves a read-only mailing.
  await page.getByRole('button', { name: 'Cancel mailing' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel mailing' }).click();
  await expect(await status(page)).toHaveText('Cancelled');
  await expect(page.getByText('This mailing was cancelled and is read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Subject')).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Add recipients' })).toHaveCount(0);
});

test('people: suppressions, a contact erased for good, and the audit log', async ({ page }) => {
  await open(page, '/suppressions');
  await page.getByRole('button', { name: 'Block an address' }).click();
  await page.getByLabel('Address', { exact: true }).fill('blocked@example.com');
  await page.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'blocked@example.com' })).toBeVisible();
  await page.getByRole('button', { name: 'Lift' }).click();
  await page.getByRole('button', { name: 'Lift block' }).click();
  await expect(page.getByRole('cell', { name: 'blocked@example.com' })).toHaveCount(0);

  await open(page, '/contacts?q=ana%40example.com');
  await page.getByRole('link', { name: 'ana@example.com' }).click();
  await expect(page.getByRole('link', { name: 'Hello subscribers' })).toBeVisible();
  await page.getByRole('button', { name: 'Erase contact' }).click();
  await page.getByLabel(/Type .* to confirm/).fill('ana@example.com');
  await page.getByRole('button', { name: 'Erase for good' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/contacts$`));
  await open(page, '/contacts?q=ana%40example.com');
  await expect(page.getByText('No contact with that address')).toBeVisible();
  const archived = await serviceFor(OWNER, ws).messages.list({ limit: 100 });
  expect(archived.data.some((m) => m.to === 'ana@example.com')).toBe(false);

  await open(page, '/audit');
  const log = page.getByRole('table', { name: 'Audit log' });
  await expect(log.getByText('contact.erased').first()).toBeVisible();
  await expect(log.getByText('api_key.revoked').first()).toBeVisible();
  // Filtering by an action narrows the log to it.
  await page.getByLabel('Show').selectOption('contact.erased');
  await expect(page).toHaveURL(/action=contact\.erased/);
  await expect(log.getByText('api_key.revoked')).toHaveCount(0);
});

test('members: an invitation brings in an editor; revoked and misaddressed links do nothing', async ({ page, browser }) => {
  async function createInvite(email: string, role: string) {
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Role', { exact: true }).selectOption(role);
    const link = page.getByTestId('invite-link');
    const before = (await link.count()) > 0 ? (await link.textContent())!.trim() : '';
    await page.getByRole('button', { name: 'Create invitation' }).click();
    // Wait for this invitation's link, not the one still shown from the last.
    await expect(link).not.toHaveText(before);
    await expect(page.getByText(`Send this link to ${email}`, { exact: false })).toBeVisible();
    return new URL((await link.textContent())!.trim()).pathname;
  }
  async function asPerson(who: typeof EDITOR) {
    const context = await browser.newContext();
    const p = await context.newPage();
    await signIn(p, who);
    return { context, p };
  }

  await open(page, '/settings/members');
  const editorLink = await createInvite(EDITOR.email, 'editor');
  const invitations = page.getByRole('table', { name: 'Invitations' });
  await expect(invitations.getByRole('row', { name: /editor@example.com.*pending/i })).toBeVisible();

  // Forward: the invited person accepts and lands in the workspace, without the admin screens.
  const editor = await asPerson(EDITOR);
  await editor.p.goto(editorLink);
  await editor.p.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(editor.p).toHaveURL(new RegExp(`/w/${ws}$`));
  await expect(editor.p.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  await editor.p.goto(`/w/${ws}/settings`);
  await expect(editor.p.getByRole('link', { name: 'API keys' })).toHaveCount(0);
  // Re-entry: accepting again once in is harmless.
  await editor.p.goto(editorLink);
  await editor.p.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(editor.p).toHaveURL(new RegExp(`/w/${ws}$`));

  // Someone else opening a link meant for another address is refused.
  const strangerWho = { ...EDITOR, subject: 'e2e-stranger', email: 'stranger@example.com' };
  const stranger = await asPerson(strangerWho);
  const guestLink = await createInvite('guest@example.com', 'viewer');
  await stranger.p.goto(guestLink);
  await stranger.p.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(stranger.p.getByRole('alert').filter({ hasText: 'another address' })).toBeVisible();

  // Backtrack: a revoked invitation stops working at once.
  const strangerLink = await createInvite(strangerWho.email, 'viewer');
  await page.reload();
  await invitations.getByRole('row', { name: /stranger@example.com/ }).getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  await expect(invitations.getByRole('row', { name: /stranger@example.com.*revoked/i })).toBeVisible();
  await stranger.p.goto(strangerLink);
  await stranger.p.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(stranger.p.getByRole('alert').filter({ hasText: 'withdrawn' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('table', { name: 'Members' }).getByText('editor@example.com')).toBeVisible();
  await expect(invitations.getByRole('row', { name: /editor@example.com.*accepted/i })).toBeVisible();
  await editor.context.close();
  await stranger.context.close();
});
