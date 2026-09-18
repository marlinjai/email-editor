import { MAX_ASSET_BYTES } from '@marlinjai/mail-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_BASE_URL, startHarness, type Harness } from '../support/harness.js';
import { ImageServer } from '../support/image-server.js';
import { pngBytes } from '../support/images.js';
import { documentWith, textBlock } from '../support/mail-documents.js';
import { workspaceCompile } from '../../src/compile/workspace-compile.js';
import { createScheduleJob } from '../../src/platform/schedule-job.js';
import { repos } from '../../src/repo/index.js';
import { action, addRecipients, createMailing, eventsOf, mailingStatus, seedContact, seedSending } from '../support/sending.js';

/**
 * The per-workspace asset policy and `assets.import`: where a workspace's mails
 * may load images, stylesheets and fonts from, enforced at every compile site
 * (the editor's preview, a template's compile, a test send and a send), and
 * the import that brings a remote image onto the service's host.
 */

const OPEN = { allowInsecureHttp: true, allowPrivateTargets: true };
const REMOTE = 'https://cdn.example.com/hero.png';

let h: Harness;
let images: ImageServer;
let A: Awaited<ReturnType<Harness['seedWorkspace']>>;
let B: Awaited<ReturnType<Harness['seedWorkspace']>>;
beforeAll(async () => {
  // Open policy: the import may reach the local image server on 127.0.0.1.
  h = await startHarness({ webhookUrlPolicy: OPEN });
  images = await ImageServer.start();
  A = await h.seedWorkspace('policy-a');
  B = await h.seedWorkspace('policy-b');
});
afterAll(async () => {
  await images?.stop();
  await h?.drop();
});

const setPolicy = (w: { key: string }, asset_policy: 'any' | 'service_only') =>
  h.call({ method: 'PATCH', path: '/v1/workspace', key: w.key, body: { settings: { asset_policy } } });

const imageDoc = (src: string, extra: Record<string, unknown> = {}) =>
  documentWith([{ id: 'img-1', type: 'image', src, ...extra }, textBlock('<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>', 'txt-2')]);

const compileDoc = (w: { key: string }, document: unknown) => h.call({ method: 'POST', path: '/v1/compile', key: w.key, body: { document } });

async function importFrom(w: { key: string }, path: string, extra: Record<string, unknown> = {}) {
  return h.call({ method: 'POST', path: '/v1/assets/import', key: w.key, body: { url: images.url(path), ...extra } });
}

describe('the asset_policy setting', () => {
  it('a new workspace starts with any', async () => {
    const res = await h.call({ path: '/v1/workspace', key: A.key });
    expect(res.body.settings.asset_policy).toBe('any');
  });

  it('a workspace written before the setting existed reads as any, and keeps its other settings', async () => {
    const C = await h.seedWorkspace('policy-legacy');
    await h.sql`UPDATE workspaces SET settings = settings - 'asset_policy' WHERE id = ${C.id}`;
    const res = await h.call({ path: '/v1/workspace', key: C.key });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ asset_policy: 'any', default_locale: 'en', tracking_enabled: false });
    const listed = await h.call({ path: '/v1/workspaces', subject: C.owner });
    expect(listed.body.data.find((w: { id: string }) => w.id === C.id).settings.asset_policy).toBe('any');
    // A partial update of another setting keeps working on such a row.
    const updated = await h.call({ method: 'PATCH', path: '/v1/workspace', key: C.key, body: { settings: { tracking_enabled: false } } });
    expect(updated.status).toBe(200);
    expect(updated.body.settings.asset_policy).toBe('any');
  });

  it('an admin sets and clears it, audited with from and to; a bad value and a send key are refused', async () => {
    const C = await h.seedWorkspace('policy-set');
    const on = await setPolicy(C, 'service_only');
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body.settings.asset_policy).toBe('service_only');
    expect((await h.call({ path: '/v1/workspace', key: C.key })).body.settings.asset_policy).toBe('service_only');
    const audit = await h.call({ path: '/v1/audit-log?action=workspace.updated', key: C.key });
    expect(audit.body.data[0].details).toMatchObject({ settings: ['asset_policy'], asset_policy: { from: 'any', to: 'service_only' } });

    const bad = await h.call({ method: 'PATCH', path: '/v1/workspace', key: C.key, body: { settings: { asset_policy: 'none' } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');

    const sendKey = await h.call({ method: 'POST', path: '/v1/api-keys', key: C.key, body: { name: 'sender', scope: 'send' } });
    const refused = await setPolicy({ key: sendKey.body.key }, 'any');
    expect(refused.status).toBe(403);

    const off = await setPolicy(C, 'any');
    expect(off.body.settings.asset_policy).toBe('any');
  });
});

describe('compiling under the policy', () => {
  let C: Awaited<ReturnType<Harness['seedWorkspace']>>;
  let hosted: string;
  beforeAll(async () => {
    C = await h.seedWorkspace('policy-compile');
    const f = new FormData();
    f.append('file', new Blob([pngBytes(10, 10)], { type: 'image/png' }), 'own.png');
    hosted = (await h.call({ method: 'POST', path: '/v1/assets', key: C.key, form: f })).body.url;
    expect(hosted.startsWith(`${PUBLIC_BASE_URL}/a/`)).toBe(true);
  });

  it('under any, a remote image and a Google font compile without errors, as before', async () => {
    await setPolicy(C, 'any');
    const res = await compileDoc(C, documentWith([{ id: 'i', type: 'image', src: REMOTE }, { id: 't', type: 'text', content: '<p>x</p>', fontFamily: 'Roboto, Arial' }]));
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.html).toContain('fonts.googleapis.com');
  });

  it('under service_only, the preview reports every remote address: img, srcset, inline style, head style, stylesheet, @font-face', async () => {
    await setPolicy(C, 'service_only');
    const raw = {
      id: 'raw-1',
      type: 'raw',
      html: `<img src="${hosted}" srcset="${hosted} 1x, https://cdn.example.com/2x.png 2x"><div style="background-image:url('https://cdn.example.com/bg.png')">x</div>`,
    };
    const document = {
      ...documentWith([{ id: 'i', type: 'image', src: REMOTE }, raw, { id: 't', type: 'text', content: '<p>x</p>', fontFamily: 'Brand, Arial' }]),
      metadata: { title: 'P', fonts: [{ name: 'Brand', href: 'https://fonts.example.com/brand.css' }] },
    };
    const res = await compileDoc(C, document);
    expect(res.status).toBe(200);
    const messages = res.body.errors.map((e: { message: string }) => e.message).join('\n');
    expect(messages).toContain(`<img src>: "${REMOTE}"`);
    expect(messages).toContain('<img srcset>: "https://cdn.example.com/2x.png"');
    expect(messages).toContain('<div style>: "https://cdn.example.com/bg.png"');
    expect(messages).toContain('<link href>: "https://fonts.example.com/brand.css"');
    expect(messages).toMatch(/<style>: "https:\/\/fonts\.example\.com\/brand\.css"/);
    expect(messages).not.toContain(`"${hosted}"`);
  });

  it('under service_only, a known Google font is not imported at all, and a document on the service host compiles clean', async () => {
    await setPolicy(C, 'service_only');
    const res = await compileDoc(
      C,
      documentWith([
        { id: 'i', type: 'image', src: hosted },
        { id: 't', type: 'text', content: '<p>x</p>', fontFamily: 'Roboto, Arial' },
      ]),
    );
    expect(res.body.errors).toEqual([]);
    expect(res.body.html).not.toContain('fonts.googleapis.com');
    expect(res.body.html).toContain(hosted);
  });

  it('templates.compile applies it too, to the current and to a past version', async () => {
    await setPolicy(C, 'service_only');
    const t = await h.call({ method: 'POST', path: '/v1/templates', key: C.key, body: { name: 'Remote', document: imageDoc(REMOTE) } });
    expect(t.status).toBe(201);
    const current = await h.call({ method: 'POST', path: `/v1/templates/${t.body.id}/compile`, key: C.key, body: {} });
    expect(current.body.errors.length).toBe(1);
    const past = await h.call({ method: 'POST', path: `/v1/templates/${t.body.id}/compile`, key: C.key, body: { version: 1 } });
    expect(past.body.errors[0].message).toContain('cdn.example.com');
    await setPolicy(C, 'any');
    const relaxed = await h.call({ method: 'POST', path: `/v1/templates/${t.body.id}/compile`, key: C.key, body: {} });
    expect(relaxed.body.errors).toEqual([]);
  });

  it('only the workspace that chose service_only is held to it', async () => {
    await setPolicy(C, 'service_only');
    expect((await compileDoc(C, imageDoc(REMOTE))).body.errors.length).toBe(1);
    expect((await compileDoc(B, imageDoc(REMOTE))).body.errors).toEqual([]);
    await setPolicy(C, 'any');
  });
});

describe('sending under the policy', () => {
  let S: Awaited<ReturnType<Harness['seedWorkspace']>>;
  let seeded: Awaited<ReturnType<typeof seedSending>>;
  beforeAll(async () => {
    S = await h.seedWorkspace('policy-send');
    seeded = await seedSending(h, S.id);
    await seedContact(h, S.id, seeded.topic.id, { email: 'reader@example.com', first_name: 'Reader' });
  });

  async function draft(document: unknown) {
    const m = await createMailing(h, S, { topic: 'news', provider_id: seeded.provider.id, document });
    const contact = (await h.sql<{ id: string }[]>`SELECT id FROM contacts WHERE workspace_id = ${S.id} LIMIT 1`)[0]!;
    await addRecipients(h, S, m.id, [{ contact_id: contact.id }]);
    return m;
  }

  it('refuses the send and the test send of a mailing with a remote image, and sends once the image is imported', async () => {
    await setPolicy(S, 'service_only');
    images.on('/send-hero.png', { body: pngBytes(20, 10) });
    const m = await draft(imageDoc(images.url('/send-hero.png')));

    const test = await action(h, S, m.id, 'test', { to: 'me@studio.test' });
    expect(test.status).toBe(422);
    expect(test.body.error.code).toBe('compile_failed');
    const send = await action(h, S, m.id, 'send');
    expect(send.status).toBe(422);
    expect(send.body.error.code).toBe('compile_failed');
    expect(JSON.stringify(send.body.error.details.errors)).toContain('127.0.0.1');
    expect((await h.call({ path: `/v1/mailings/${m.id}`, key: S.key })).body.status).toBe('draft');

    // Revise: import the image, point the document at the service's copy.
    const imported = await importFrom(S, '/send-hero.png');
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    const updated = await h.call({ method: 'PATCH', path: `/v1/mailings/${m.id}`, key: S.key, body: { document: imageDoc(imported.body.url) } });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect((await action(h, S, m.id, 'test', { to: 'me@studio.test' })).status).toBe(200);
    const sent = await action(h, S, m.id, 'send');
    expect(sent.status, JSON.stringify(sent.body)).toBe(202);
  });

  it('a snapshot compiled under any is held to service_only once the workspace switches', async () => {
    await setPolicy(S, 'any');
    const m = await draft(imageDoc(REMOTE));
    expect((await action(h, S, m.id, 'send')).status).toBe(202);
    await action(h, S, m.id, 'pause');
    await setPolicy(S, 'service_only');
    const test = await action(h, S, m.id, 'test', { to: 'me@studio.test' });
    expect(test.status).toBe(422);
    expect(test.body.error.code).toBe('compile_failed');
    await action(h, S, m.id, 'cancel');
    await setPolicy(S, 'any');
  });

  it('schedule runs the same check, and a scheduled mailing goes back to draft if the policy tightened before its time', async () => {
    await setPolicy(S, 'service_only');
    const refused = await draft(imageDoc(REMOTE));
    const at = new Date(Date.now() + 2 * 60_000);
    const early = await action(h, S, refused.id, 'schedule', { send_at: at.toISOString() });
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('compile_failed');

    await setPolicy(S, 'any');
    const m = await draft(imageDoc(REMOTE));
    expect((await action(h, S, m.id, 'schedule', { send_at: at.toISOString() })).status).toBe(200);
    await setPolicy(S, 'service_only');
    // The release compiles the way the platform worker does (src/platform/jobs.ts).
    const forWorkspace = workspaceCompile(repos(h.sql), h.compiler, PUBLIC_BASE_URL);
    const job = createScheduleJob({ sql: h.sql, compile: (ws, d) => forWorkspace.compile(ws, d), log: { error: () => {}, log: () => {} } });
    expect(await job.tick(new Date(Date.now() + 3 * 60_000))).toBe(true);
    expect(await mailingStatus(h, S.id, m.id)).toBe('draft');
    const failed = (await eventsOf(h, S.id, 'mailing.schedule_failed')).find((e) => e.payload.data.mailing_id === m.id);
    expect(failed!.payload.data).toMatchObject({ code: 'compile_failed' });
    await setPolicy(S, 'any');
  });

  it('a signup form refuses a confirmation template with a remote image', async () => {
    await setPolicy(S, 'service_only');
    const confirm = documentWith([{ id: 'img-1', type: 'image', src: REMOTE }, textBlock('<p><a href="{{confirm_url}}">Confirm</a></p>', 'txt-c')]);
    const template = await h.call({ method: 'POST', path: '/v1/templates', key: S.key, body: { name: 'Confirm', document: confirm } });
    const input = { name: 'Newsletter', title: 'Stay in touch', consent_text: 'I agree.', topics: ['news'], provider_id: seeded.provider.id, confirmation_template_id: template.body.id };
    const refused = await h.call({ method: 'POST', path: '/v1/signup-forms', key: S.key, body: input });
    expect(refused.status, JSON.stringify(refused.body)).toBe(422);
    expect(refused.body.error.code).toBe('compile_failed');
    await setPolicy(S, 'any');
    const accepted = await h.call({ method: 'POST', path: '/v1/signup-forms', key: S.key, body: input });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
  });

  it('under any, the same remote image sends as before', async () => {
    await setPolicy(S, 'any');
    const m = await draft(imageDoc(REMOTE));
    expect((await action(h, S, m.id, 'send')).status).toBe(202);
  });
});

describe('assets.import', () => {
  it('copies a remote image into the workspace with a service URL, audited with its source', async () => {
    images.on('/remote/logo.png', { body: pngBytes(64, 32), headers: { 'content-type': 'application/octet-stream' } });
    const res = await importFrom(A, '/remote/logo.png');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      url: `${PUBLIC_BASE_URL}/a/${res.body.id}`,
      content_type: 'image/png',
      width: 64,
      height: 32,
      filename: 'logo.png',
    });
    const served = await h.app.request(new URL(res.body.url).pathname);
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(pngBytes(64, 32))).toBe(true);
    const log = await h.call({ path: `/v1/audit-log?target_id=${res.body.id}`, key: A.key });
    expect(log.body.data[0]).toMatchObject({ action: 'asset.imported', details: { source_url: images.url('/remote/logo.png') } });
  });

  it('takes a given file name, extension following the sniffed type', async () => {
    images.on('/x', { body: pngBytes(2, 2) });
    const res = await importFrom(A, '/x', { filename: 'Brand Mark.jpg' });
    expect(res.body.filename).toBe('Brand Mark.png');
  });

  it('with an Idempotency-Key, a retry replays the first answer and stores once', async () => {
    images.on('/idem.png', { body: pngBytes(3, 3) });
    const before = h.storage.files.size;
    const body = { url: images.url('/idem.png') };
    const first = await h.call({ method: 'POST', path: '/v1/assets/import', key: A.key, body, idempotencyKey: 'imp-1' });
    const retry = await h.call({ method: 'POST', path: '/v1/assets/import', key: A.key, body, idempotencyKey: 'imp-1' });
    expect(retry.headers.get('idempotent-replayed')).toBe('true');
    expect(retry.body.id).toBe(first.body.id);
    expect(h.storage.files.size).toBe(before + 1);
  });

  it('refuses what is not an image, stores nothing', async () => {
    images.on('/page.html', { body: Buffer.from('<html>no</html>'), headers: { 'content-type': 'image/png' } });
    images.on('/logo.svg', { body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>') });
    images.on('/empty.png', { body: Buffer.alloc(0) });
    const before = h.storage.files.size;
    expect((await importFrom(A, '/page.html')).body.error.code).toBe('unsupported_media_type');
    expect((await importFrom(A, '/logo.svg')).body.error.code).toBe('unsupported_media_type');
    expect((await importFrom(A, '/empty.png')).body.error.code).toBe('validation_failed');
    expect(h.storage.files.size).toBe(before);
  });

  it('refuses an image over the limit, by its Content-Length and while reading one without', async () => {
    const big = Buffer.concat([pngBytes(1, 1), Buffer.alloc(MAX_ASSET_BYTES)]);
    images.on('/big.png', { body: big });
    images.on('/big-chunked.png', { body: big, chunked: true });
    const declared = await importFrom(A, '/big.png');
    expect(declared.status).toBe(413);
    expect(declared.body.error.code).toBe('payload_too_large');
    const streamed = await importFrom(A, '/big-chunked.png');
    expect(streamed.status).toBe(413);
  });

  it('never follows a redirect', async () => {
    images.on('/moved.png', { redirect: images.url('/remote/logo.png') });
    images.hits.length = 0;
    const res = await importFrom(A, '/moved.png');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
    expect(res.body.error.details.status).toBe(302);
    expect(images.hits).toEqual(['/moved.png']);
  });

  it('reports a remote 4xx as invalid_request and a 5xx as a retryable provider_error', async () => {
    const missing = await importFrom(A, '/does-not-exist.png');
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.status).toBe(404);
    images.on('/broken.png', { status: 503, body: Buffer.from('down') });
    const down = await importFrom(A, '/broken.png');
    expect(down.status).toBe(502);
    expect(down.body.error).toMatchObject({ code: 'provider_error', details: { service: 'asset_import', status: 503 } });
  });

  it('gives up on a server that never answers', async () => {
    const quick = await startHarness({ webhookUrlPolicy: OPEN });
    try {
      const Q = await quick.seedWorkspace('import-timeout');
      images.on('/slow.png', 'hang');
      // The harness's app has the default 10 s deadline; this one is short.
      const { createApp } = await import('../../src/app.js');
      const { DASHBOARD_TOKEN, SECRETS_KEYS } = await import('../support/harness.js');
      const app = createApp({ sql: quick.sql, dashboardServiceToken: DASHBOARD_TOKEN, secretsKeys: SECRETS_KEYS, webhookUrlPolicy: OPEN, assetImportTimeoutMs: 300, log: { error: () => {} }, ...quick.appDeps });
      const res = await app.request('/v1/assets/import', {
        method: 'POST',
        headers: { authorization: `Bearer ${Q.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: images.url('/slow.png') }),
      });
      expect(res.status).toBe(502);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('provider_error');
    } finally {
      await quick.drop();
    }
  });

  it('refuses addresses the contract does not accept', async () => {
    for (const url of ['ftp://cdn.example.com/a.png', 'file:///etc/passwd', 'not a url']) {
      const res = await h.call({ method: 'POST', path: '/v1/assets/import', key: A.key, body: { url } });
      expect(res.body.error.code, url).toBe('validation_failed');
    }
  });

  it('a read key cannot import; a revoked key is refused', async () => {
    images.on('/k.png', { body: pngBytes(1, 1) });
    const reader = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'reader', scope: 'read' } });
    expect((await importFrom({ key: reader.body.key }, '/k.png')).status).toBe(403);
    const temp = await h.call({ method: 'POST', path: '/v1/api-keys', key: A.key, body: { name: 'temp' } });
    await h.call({ method: 'DELETE', path: `/v1/api-keys/${temp.body.api_key.id}`, key: A.key });
    expect((await importFrom({ key: temp.body.key }, '/k.png')).status).toBe(401);
  });

  it("workspace B cannot read A's imported asset", async () => {
    images.on('/tenancy.png', { body: pngBytes(4, 4) });
    const mine = await importFrom(A, '/tenancy.png');
    const theirs = await h.call({ path: `/v1/assets/${mine.body.id}`, key: B.key });
    expect(theirs.status).toBe(404);
  });
});

describe('assets.import: the server-side request forgery guard', () => {
  let strict: Harness;
  let W: Awaited<ReturnType<Harness['seedWorkspace']>>;
  beforeAll(async () => {
    // No policy: production's.
    strict = await startHarness();
    W = await strict.seedWorkspace('ssrf');
  });
  afterAll(() => strict?.drop());

  const importUrl = (url: string, harness: Harness = strict, key = W.key) =>
    harness.call({ method: 'POST', path: '/v1/assets/import', key, body: { url } });

  it('refuses loopback, private and link-local targets, as literals and by name, and never connects', async () => {
    images.on('/secret.png', { body: pngBytes(1, 1) });
    images.hits.length = 0;
    for (const url of [
      images.url('/secret.png'),
      'http://10.0.0.5/x.png',
      'http://192.168.1.1/x.png',
      'http://172.16.0.1/x.png',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]/x.png',
      'http://[fd00::1]/x.png',
      'http://localhost/x.png',
      'http://0.0.0.0/x.png',
      // IPv4-mapped loopback, which the URL parser rewrites to ::ffff:7f00:1.
      images.url('/secret.png').replace('127.0.0.1', '[::ffff:127.0.0.1]'),
      'http://[::ffff:7f00:1]/x.png',
      'http://[::ffff:a9fe:a9fe]/latest/meta-data/',
      // The shared address space, where the service's Tailscale peers live.
      'http://100.100.100.100/x.png',
    ]) {
      const res = await importUrl(url);
      expect(res.status, url).toBe(400);
      expect(res.body.error.code, url).toBe('invalid_request');
    }
    expect(images.hits).toEqual([]);
  });

  it('refuses a name that resolves to a private address, and one that changes its answer after the first check', async () => {
    let calls = 0;
    const rebinding = await startHarness({
      webhookUrlPolicy: {
        allowInsecureHttp: true,
        resolve: async (host) => {
          if (host === 'private.example.test') return [{ address: '10.1.2.3', family: 4 }];
          // Public on the first look, loopback when the socket connects.
          calls += 1;
          return calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }];
        },
      },
    });
    try {
      const R = await rebinding.seedWorkspace('rebind');
      const priv = await importUrl('http://private.example.test/x.png', rebinding, R.key);
      expect(priv.body.error.code).toBe('invalid_request');
      expect(priv.body.error.message).toContain('10.1.2.3');
      const rebound = await importUrl('http://rebind.example.test/x.png', rebinding, R.key);
      expect(rebound.body.error.code).toBe('invalid_request');
      expect(rebound.body.error.message).toContain('127.0.0.1');
      expect(calls).toBe(2);
    } finally {
      await rebinding.drop();
    }
  });

  it('refuses an address with credentials in it', async () => {
    const res = await importUrl('https://user:pass@cdn.example.com/a.png');
    expect(res.body.error.code).toBe('invalid_request');
  });
});
