import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { OWNER, serviceFor, setPlan, signIn, sink, SMTP_LOGIN } from './helpers';
import { REMOTE_IMAGE_URL } from './stack';

/*
 * MJML import and export end to end, in a workspace of their own. The import
 * is a stateful flow, covered on the four paths of the stateful-flow standard:
 * forward (paste, preview, create, edit, export), backtrack (a changed source
 * discards the preview; an unchanged one keeps it), resume (a reload on the
 * preview step), re-entry (the same file twice makes two templates; one
 * idempotency key makes one).
 */

test.describe.configure({ mode: 'serial' });

let ws = '';
let providerId = '';
let importedId = '';

const MJML = (headline: string) => `<mjml>
  <mj-head><mj-title>${headline}</mj-title></mj-head>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-weight="700">${headline}</mj-text>
        <mj-image src="${REMOTE_IMAGE_URL}" alt="Logo" width="80px" />
        <mj-social><mj-social-element name="github" href="https://github.com/example">GitHub</mj-social-element></mj-social>
        <mj-text><a href="{{unsubscribe_url}}">Unsubscribe</a></mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

async function open(page: Page, path: string) {
  await page.goto(`/w/${ws}${path}`);
}

async function pasteAndPreview(page: Page, name: string, mjml: string) {
  await open(page, '/templates/import');
  await page.getByLabel('Template name').fill(name);
  await page.getByLabel('MJML', { exact: true }).fill(mjml);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import MJML' })).toBeVisible();
}

const preview = (page: Page) => page.frameLocator('iframe[title="Preview of the imported MJML"]');

test.beforeEach(async ({ page }) => {
  await signIn(page, OWNER);
});

test('setup: a workspace with a provider and a topic', async () => {
  const created = await serviceFor(OWNER).workspaces.create({
    name: 'E2E MJML',
    slug: 'e2e-mjml',
    owner: { email: OWNER.email, name: OWNER.name },
    company_id: OWNER.companies[0]!.id,
  });
  ws = created.id;
  await setPlan(ws, 'design_partner');
  const api = serviceFor(OWNER, ws);
  providerId = (
    await api.providers.create({
      kind: 'smtp',
      name: 'Sink',
      from_name: 'E2E MJML',
      from_email: 'mjml@example.com',
      reply_to: null,
      policy: { daily_recipient_budget: 10_000, min_interval_ms: 0, max_recipients_per_message: 1 },
      config: { host: '127.0.0.1', port: (await sink()).port, security: 'tls', username: SMTP_LOGIN.user, password: SMTP_LOGIN.password },
    })
  ).id;
  await api.topics.create({ slug: 'news', name: 'News' });
});

test('forward: paste, preview with warnings and remote images, create with the images copied, open the editor', async ({ page }) => {
  await open(page, '/templates');
  await page.getByRole('link', { name: 'Import MJML' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/templates/import$`));
  // Empty state: nothing to preview yet.
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();

  await pasteAndPreview(page, 'Imported autumn', MJML('Autumn is here'));
  await expect(preview(page).getByText('Autumn is here')).toBeVisible();
  const attention = page.getByText(/^Needs your attention/);
  await expect(attention).toBeVisible();
  await expect(page.getByText("The editor's Social block draws its own icons", { exact: false })).toBeVisible();
  await expect(page.getByText('Images from other servers')).toBeVisible();
  await expect(page.getByText(REMOTE_IMAGE_URL)).toBeVisible();
  const copy = page.getByRole('checkbox', { name: 'Import images into assets' });
  await expect(copy).not.toBeChecked();
  await copy.check();

  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/templates/[0-9a-f-]{36}$`));
  importedId = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByLabel('Template name')).toHaveValue('Imported autumn');

  const stored = await serviceFor(OWNER, ws).templates.get(importedId);
  const json = JSON.stringify(stored.document);
  expect(json).not.toContain(REMOTE_IMAGE_URL);
  expect(json).toMatch(/\/a\/[0-9a-f-]{36}/);
});

test('refused: broken MJML says where', async ({ page }) => {
  await open(page, '/templates/import');
  await page.getByLabel('Template name').fill('Broken');
  await page.getByLabel('MJML', { exact: true }).fill('<mjml>\n<mj-body>\n  <mj-section>\n</mj-body></mjml>');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const refusal = page.getByRole('alert').filter({ hasText: 'Line 4, column 1' });
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText('The MJML could not be read.');
  // Still on the first step, the source kept for fixing.
  await expect(page.getByLabel('MJML', { exact: true })).toHaveValue(/mj-section/);
});

test('backtrack: changing the MJML discards the preview; going back unchanged keeps it', async ({ page }) => {
  await pasteAndPreview(page, 'Backtrack', MJML('First version'));
  await expect(preview(page).getByText('First version')).toBeVisible();

  // Back, unchanged: the same preview comes back without another round trip.
  await page.getByRole('button', { name: 'Back to the MJML' }).click();
  await page.getByRole('button', { name: 'Back to the preview' }).click();
  await expect(preview(page).getByText('First version')).toBeVisible();

  // Back, changed: the old preview and its warnings are gone.
  await page.getByRole('button', { name: 'Back to the MJML' }).click();
  await page.getByLabel('MJML', { exact: true }).fill(MJML('Second version').replace(/<mj-social>.*<\/mj-social>/, ''));
  await expect(page.getByRole('button', { name: 'Back to the preview' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(preview(page).getByText('Second version')).toBeVisible();
  await expect(preview(page).getByText('First version')).toHaveCount(0);
  await expect(page.getByText(/^Needs your attention/)).toHaveCount(0);
});

test('resume: a reload on the preview step previews the same MJML again', async ({ page }) => {
  await pasteAndPreview(page, 'Resumed', MJML('Survives a reload'));
  await expect(preview(page).getByText('Survives a reload')).toBeVisible();
  await page.reload();
  await expect(preview(page).getByText('Survives a reload')).toBeVisible();
  await expect(page.getByLabel('Template name')).toHaveValue('Resumed');
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/templates/[0-9a-f-]{36}$`));
});

test('re-entry: the same file twice gives two templates; one idempotency key gives one', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await open(page, '/templates/import');
    // A finished import leaves nothing behind.
    await expect(page.getByLabel('MJML', { exact: true })).toHaveValue('');
    await page.getByLabel('MJML', { exact: true }).fill(MJML('Twice'));
    await page.getByLabel('Template name').fill('Twice');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('button', { name: 'Create template' }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${ws}/templates/[0-9a-f-]{36}$`));
  }
  const api = serviceFor(OWNER, ws);
  const list = await api.templates.list({ limit: 100 });
  expect(list.data.filter((t) => t.name === 'Twice')).toHaveLength(2);

  const body = { name: 'Once', mjml: MJML('Once') };
  const a = await api.templates.import(body, { idempotencyKey: 'e2e-mjml-once' });
  const b = await api.templates.import(body, { idempotencyKey: 'e2e-mjml-once' });
  expect(b.template.id).toBe(a.template.id);
});

test('export from the editor: MJML and HTML files, addresses absolute', async ({ page }) => {
  await open(page, `/templates/${importedId}`);
  await page.getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('menu', { name: 'Export as' })).toBeVisible();
  const [mjml] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'MJML (.mjml)' }).click()]);
  expect(mjml.suggestedFilename()).toBe('Imported-autumn.mjml');
  const mjmlText = await readFile((await mjml.path())!, 'utf8');
  expect(mjmlText).toContain('<mj-title>Autumn is here</mj-title>');
  expect(mjmlText).toMatch(/src="https?:\/\/[^"]+\/a\/[0-9a-f-]{36}"/);

  // Keyboard: open with the arrow key, Escape closes and returns focus.
  await page.getByRole('button', { name: 'Export' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'MJML (.mjml)' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export' })).toBeFocused();

  await page.getByRole('button', { name: 'Export' }).click();
  const [html] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'HTML (.html)' }).click()]);
  expect(html.suggestedFilename()).toBe('Imported-autumn.html');
  const htmlText = await readFile((await html.path())!, 'utf8');
  expect(htmlText).toMatch(/^<!doctype html>/i);
  expect(htmlText).toContain('Autumn is here');
});

test("export a mailing's snapshot, and the warnings of a workspace that allows only its own images", async ({ page }) => {
  const api = serviceFor(OWNER, ws);
  const remote = await api.templates.import({ name: 'Still remote', mjml: MJML('Remote image') });
  const mailing = await api.mailings.create({ template_id: remote.template.id, subject: 'Snapshot news', topic: 'news', provider_id: providerId });

  await open(page, `/mailings/${mailing.id}`);
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'HTML (.html)' }).click()]);
  expect(file.suggestedFilename()).toBe('Snapshot-news.html');
  expect(await readFile((await file.path())!, 'utf8')).toContain('Remote image');
  // Under the "any" policy nothing would block sending: no report.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await api.workspace.update({ settings: { asset_policy: 'service_only' } });
  try {
    await page.getByRole('button', { name: 'Export' }).click();
    const [again] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'MJML (.mjml)' }).click()]);
    expect(again.suggestedFilename()).toBe('Snapshot-news.mjml');
    const dialog = page.getByRole('dialog', { name: 'Snapshot-news.mjml is downloaded' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('127.0.0.1');
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await api.workspace.update({ settings: { asset_policy: 'any' } });
  }
});
