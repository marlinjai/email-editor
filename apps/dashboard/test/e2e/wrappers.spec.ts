import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { OWNER, serviceFor, setPlan, signIn } from './helpers';

/*
 * Editable wrappers (a container around sections, MJML mj-wrapper) in the
 * dashboard's editor, on the four paths of the stateful-flow standard:
 * forward (wrap two sections, style the container, save, export MJML),
 * backtrack (unwrap after styling; undo brings it back with its styles; the
 * delete dialog's choices), resume (a reload keeps the container and its
 * styles), re-entry (an MJML import with a wrapper is edited visually).
 */

test.describe.configure({ mode: 'serial' });

let ws = '';
let templateId = '';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const section = (id: string, text: string) => ({
  id,
  type: 'section',
  columns: [{ id: `${id}-col`, blocks: [{ id: `${id}-txt`, type: 'text', content: `<p>${text}</p>` }] }],
});

const WRAPPED_MJML = `<mjml>
  <mj-head><mj-title>Imported cards</mj-title></mj-head>
  <mj-body>
    <mj-wrapper background-color="#eef1f4" border-radius="10px" padding="16px 0" gap="8px">
      <mj-section><mj-column><mj-text>Imported first card</mj-text></mj-column></mj-section>
      <mj-section><mj-column><mj-text>Imported second card</mj-text></mj-column></mj-section>
    </mj-wrapper>
    <mj-section><mj-column><mj-text><a href="{{unsubscribe_url}}">Unsubscribe</a></mj-text></mj-column></mj-section>
  </mj-body>
</mjml>`;

async function openEditor(page: Page, id = templateId) {
  await page.goto(`/w/${ws}/templates/${id}`);
  await expect(page.locator('.email-renderer')).toBeVisible();
}

const canvasWrapper = (page: Page) => page.locator('[data-wrapper-id]');
const inspector = (page: Page) => page.getByTestId('wrapper-properties');

async function selectWrapper(page: Page) {
  await canvasWrapper(page).first().getByRole('button', { name: /^Select container/ }).click();
  await expect(inspector(page)).toBeVisible();
}

async function save(page: Page, version: number) {
  await page.getByTestId('save-template').click();
  await expect(page.getByText(`Saved as v${version}`)).toBeVisible();
}

async function exportMjml(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'MJML (.mjml)' }).click()]);
  return readFile((await file.path())!, 'utf8');
}

async function computed(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);
}

test.beforeEach(async ({ page }) => {
  await signIn(page, OWNER);
});

test('setup: a workspace and a template with three sections', async () => {
  const created = await serviceFor(OWNER).workspaces.create({
    name: 'E2E Wrappers',
    slug: 'e2e-wrappers',
    owner: { email: OWNER.email, name: OWNER.name },
    company_id: OWNER.companies[0]!.id,
  });
  ws = created.id;
  await setPlan(ws, 'design_partner');
  templateId = (
    await serviceFor(OWNER, ws).templates.create({
      name: 'Cards',
      document: { version: '1.1', metadata: { title: 'Cards' }, sections: [section('alpha', 'Alpha card'), section('beta', 'Beta card'), section('gamma', 'Gamma footer')] },
    })
  ).id;
});

test('forward: wrap two sections, style the container, save, export MJML with mj-wrapper', async ({ page }) => {
  await openEditor(page);
  await expect(canvasWrapper(page)).toHaveCount(0);

  // Wrap the first section from its canvas toolbar: the new container is selected.
  const alpha = page.locator('[data-section-id="alpha"]');
  await alpha.locator('.section-handle').click();
  await alpha.getByRole('button', { name: 'Wrap in container' }).click();
  await expect(inspector(page)).toBeVisible();
  await expect(canvasWrapper(page).locator('[data-section-id="alpha"]')).toBeVisible();

  // The second joins it by a keyboard drag in the Layers panel, onto the container's end.
  await page.getByRole('button', { name: 'layers' }).click();
  const betaHandle = page.getByTestId('layers-section-beta').getByRole('button', { name: /^Drag/ });
  await betaHandle.focus();
  await page.keyboard.press('Space');
  await expect(betaHandle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowUp');
  // The container's closing row is the drop target (it lights up), then the drop.
  await expect(page.locator('[data-testid^="layers-end-"]')).toHaveAttribute('data-over', 'true');
  await page.keyboard.press('Space');
  await expect(canvasWrapper(page).locator('[data-section-id="beta"]')).toBeVisible();
  await expect(page.getByTestId(/^layers-wrapper-/)).toContainText('Container, 2 sections');

  // Style it in the inspector; the canvas shows what the mail will.
  await selectWrapper(page);
  await inspector(page).getByLabel('Background colour', { exact: true }).fill('#fff4e5');
  await inspector(page).getByLabel('Padding top').fill('32');
  await inspector(page).getByLabel('Border', { exact: true }).fill('2px solid #0b6e4f');
  await inspector(page).getByLabel('Corner radius').fill('12px');
  await inspector(page).getByLabel('Gap between sections').fill('16');
  const box = canvasWrapper(page).first();
  expect(await computed(box, 'background-color')).toBe('rgb(255, 244, 229)');
  expect(await computed(box, 'border-top-left-radius')).toBe('12px');
  expect(await computed(box, 'padding-top')).toBe('32px');
  expect(await computed(box.locator('[data-section-id="beta"]').locator('..'), 'margin-top')).toBe('16px');

  // A gap that is not a length in px is refused where it is typed.
  await inspector(page).getByLabel('Gap between sections').fill('1em');
  await expect(inspector(page).getByRole('alert')).toContainText('length in px');
  await inspector(page).getByLabel('Gap between sections').fill('16px');
  await expect(inspector(page).getByRole('alert')).toHaveCount(0);

  // The background image comes through the dashboard's image dialog (the editor's onRequestImage).
  await inspector(page).getByRole('button', { name: 'image' }).click();
  await inspector(page).getByRole('button', { name: 'Choose background image' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an image' })).toBeVisible();
  await page.getByLabel('Upload').setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: PNG });
  await page.getByRole('button', { name: 'Upload and use' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an image' })).toBeHidden();
  await expect(inspector(page).getByRole('button', { name: 'Replace background image' })).toBeVisible();

  await save(page, 2);
  const stored = (await serviceFor(OWNER, ws).templates.get(templateId)).document as { version: string; sections: Array<Record<string, unknown>> };
  expect(stored.version).toBe('1.1');
  expect(stored.sections.map((s) => s.type)).toEqual(['wrapper', 'section']);
  expect(stored.sections[0]).toMatchObject({
    backgroundColor: '#fff4e5',
    border: '2px solid #0b6e4f',
    borderRadius: '12px',
    gap: '16px',
    padding: { top: '32px' },
  });
  expect(String(stored.sections[0]!.backgroundImage)).toMatch(/\/a\/[0-9a-f-]{36}$/);

  const mjml = await exportMjml(page);
  const wrapper = /<mj-wrapper ([^>]*)>([\s\S]*?)<\/mj-wrapper>/.exec(mjml);
  expect(wrapper).not.toBeNull();
  expect(wrapper![1]).toContain('background-color="#fff4e5"');
  expect(wrapper![1]).toContain('border="2px solid #0b6e4f"');
  expect(wrapper![1]).toContain('border-radius="12px"');
  expect(wrapper![1]).toContain('padding="32px 0 0 0"');
  expect(wrapper![1]).toContain('gap="16px"');
  expect(wrapper![1]).toMatch(/background-url="https?:\/\/[^"]+\/a\/[0-9a-f-]{36}"/);
  expect(wrapper![2].match(/<mj-section/g)).toHaveLength(2);
  expect(wrapper![2]).toContain('Alpha card');
  expect(wrapper![2]).toContain('Beta card');
  expect(mjml.slice(mjml.indexOf('</mj-wrapper>'))).toContain('Gamma footer');
});

test('backtrack: unwrap after styling, undo brings the container back with its styles; the delete dialog', async ({ page }) => {
  await openEditor(page);
  await selectWrapper(page);
  await inspector(page).getByRole('button', { name: 'Unwrap' }).click();
  await expect(canvasWrapper(page)).toHaveCount(0);
  await expect(page.locator('[data-section-id="alpha"]')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(canvasWrapper(page)).toHaveCount(1);
  expect(await computed(canvasWrapper(page).first(), 'background-color')).toBe('rgb(255, 244, 229)');
  await expect(canvasWrapper(page).locator('[data-section-id="beta"]')).toBeVisible();

  // Redo unwraps again, and undo once more restores it: history runs both ways.
  await page.getByRole('button', { name: 'Redo' }).first().click();
  await expect(canvasWrapper(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(canvasWrapper(page)).toHaveCount(1);

  // Revise an earlier input: the export follows the new value, not the old one.
  await selectWrapper(page);
  await inspector(page).getByLabel('Corner radius').fill('4px');

  // Delete asks in the editor's own dialog; Cancel and Escape keep everything.
  await inspector(page).getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this container?' });
  await expect(dialog).toContainText('It holds 2 sections');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(canvasWrapper(page)).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(canvasWrapper(page)).toHaveCount(1);

  // Keep the sections: the container goes, they stay; undo brings it back.
  await selectWrapper(page);
  await inspector(page).getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Keep the sections' }).click();
  await expect(canvasWrapper(page)).toHaveCount(0);
  await expect(page.locator('[data-section-id="beta"]')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(canvasWrapper(page)).toHaveCount(1);

  // Delete everything: the sections go with it; undo again.
  await selectWrapper(page);
  await inspector(page).getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.locator('[data-section-id="alpha"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(canvasWrapper(page).locator('[data-section-id="alpha"]')).toBeVisible();

  await save(page, 3);
  const mjml = await exportMjml(page);
  expect(mjml).toMatch(/<mj-wrapper [^>]*border-radius="4px"/);
  expect(mjml).not.toContain('border-radius="12px"');
});

test('resume: a reload keeps the container and its styles', async ({ page }) => {
  await openEditor(page);
  await expect(canvasWrapper(page)).toHaveCount(1);
  const box = canvasWrapper(page).first();
  expect(await computed(box, 'background-color')).toBe('rgb(255, 244, 229)');
  expect(await computed(box, 'border-top-left-radius')).toBe('4px');
  await expect(box.locator('[data-section-id="alpha"]')).toBeVisible();
  await expect(box.locator('[data-section-id="beta"]')).toBeVisible();

  await selectWrapper(page);
  await expect(inspector(page).getByLabel('Corner radius')).toHaveValue('4px');
  await expect(inspector(page).getByLabel('Gap between sections')).toHaveValue('16px');
  await expect(inspector(page).getByLabel('Border', { exact: true })).toHaveValue('2px solid #0b6e4f');

  // Nothing changed by opening it: no unsaved changes, and the Layers panel nests the sections.
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await page.getByRole('button', { name: 'layers' }).click();
  await expect(page.getByTestId(/^layers-wrapper-/)).toContainText('Container, 2 sections');
});

test('re-entry: an imported MJML wrapper is a container, edited visually and exported again', async ({ page }) => {
  await page.goto(`/w/${ws}/templates/import`);
  await page.getByLabel('Template name').fill('Imported cards');
  await page.getByLabel('MJML', { exact: true }).fill(WRAPPED_MJML);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import MJML' })).toBeVisible();
  // The wrapper is not "kept as HTML" any more.
  await expect(page.getByText(/kept as compiled HTML/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/templates/[0-9a-f-]{36}$`));
  const importedId = new URL(page.url()).pathname.split('/').pop()!;

  await expect(canvasWrapper(page)).toHaveCount(1);
  const box = canvasWrapper(page).first();
  expect(await computed(box, 'background-color')).toBe('rgb(238, 241, 244)');
  await expect(box).toContainText('Imported first card');
  await expect(box).toContainText('Imported second card');

  await selectWrapper(page);
  await expect(inspector(page).getByLabel('Gap between sections')).toHaveValue('8px');
  await inspector(page).getByLabel('Background colour', { exact: true }).fill('#123456');
  await inspector(page).getByRole('checkbox', { name: 'Full width' }).check();
  await save(page, 2);

  const doc = (await serviceFor(OWNER, ws).templates.get(importedId)).document as { sections: Array<Record<string, unknown>> };
  expect(doc.sections[0]).toMatchObject({ type: 'wrapper', backgroundColor: '#123456', fullWidth: true, gap: '8px', borderRadius: '10px' });

  const mjml = await exportMjml(page);
  expect(mjml).toMatch(/<mj-wrapper background-color="#123456"[^>]*full-width="full-width"/);
  expect(mjml.match(/<mj-section/g)!.length).toBe(3);
});
