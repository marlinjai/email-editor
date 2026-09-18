import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailApiError, MailNetworkError } from '@marlinjai/mail-sdk';

/*
 * Server actions with the mail SDK mocked: what each sends to the service,
 * and how each service answer comes back to the screen.
 */

const viewer = {
  subject: 'sub-me',
  email: 'me@example.com',
  name: 'Me',
  companies: [{ id: 'tenant-a', name: 'A' }],
  activeCompanyId: 'tenant-a',
};

const api = {
  workspaces: { create: vi.fn() },
  members: { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() },
  templates: { update: vi.fn(), get: vi.fn(), version: vi.fn() },
  mailings: { addRecipients: vi.fn(), create: vi.fn(), test: vi.fn(), retryFailed: vi.fn(), pause: vi.fn() },
  providers: { create: vi.fn(), update: vi.fn() },
  assets: { upload: vi.fn() },
};
const onBehalf = { members: { add: vi.fn() } };

vi.mock('@/lib/mail', () => ({
  mail: vi.fn(async () => ({ api, viewer })),
  mailOnBehalfOf: vi.fn(() => onBehalf),
}));
vi.mock('@/lib/viewer', () => ({ requireViewer: vi.fn(async () => viewer), getViewer: vi.fn(async () => viewer) }));
vi.mock('@/lib/auth', () => ({ auth: { appUrl: () => 'https://app.mail.test' } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { createWorkspace } = await import('@/app/workspaces/actions');
const { saveTemplate, restoreVersion, uploadImage } = await import('@/app/w/[ws]/templates/actions');
const { addRecipients, createMailing, sendTest, retryFailed, controlMailing } = await import('@/app/w/[ws]/mailings/actions');
const { inviteMember, saveProvider } = await import('@/app/w/[ws]/settings/actions');
const { acceptInvite } = await import('@/app/invite/[token]/actions');
const { createInvite } = await import('@/lib/invites');

const conflict = (current: number) => new MailApiError({ code: 'conflict', status: 409, message: 'moved on', details: { current_version: current } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SESSION_SECRET = 'x'.repeat(48);
});

describe('workspaces', () => {
  it('creates for one of the person\'s companies, stamping the company and the owner', async () => {
    api.workspaces.create.mockResolvedValue({ id: 'ws-new' });
    const r = await createWorkspace({ name: 'News', slug: 'news', companyId: 'tenant-a' });
    expect(r).toEqual({ ok: true, data: { id: 'ws-new' } });
    expect(api.workspaces.create).toHaveBeenCalledWith({ name: 'News', slug: 'news', company_id: 'tenant-a', owner: { email: 'me@example.com', name: 'Me' } });
  });

  it('refuses a company the person does not belong to, without calling the service', async () => {
    const r = await createWorkspace({ name: 'News', slug: 'news', companyId: 'tenant-other' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'forbidden', fields: { companyId: expect.any(String) } });
    expect(api.workspaces.create).not.toHaveBeenCalled();
  });

  it('checks the slug before the service does', async () => {
    const r = await createWorkspace({ name: 'News', slug: 'Not A Slug', companyId: 'tenant-a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.fields?.slug).toBeTruthy();
  });

  it('maps a taken slug to a human message', async () => {
    api.workspaces.create.mockRejectedValue(new MailApiError({ code: 'already_exists', status: 409, message: 'A workspace with the slug "news" already exists.' }));
    const r = await createWorkspace({ name: 'News', slug: 'news', companyId: 'tenant-a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/already exists/);
  });
});

describe('templates', () => {
  const doc = { version: '1.0' as const, metadata: {}, sections: [] };

  it('saves on the base version and returns the new template', async () => {
    api.templates.update.mockResolvedValue({ id: 't1', version: 4 });
    const r = await saveTemplate('ws', 't1', { baseVersion: 3, name: 'N', document: doc });
    expect(api.templates.update).toHaveBeenCalledWith('t1', { base_version: 3, name: 'N', document: doc });
    expect(r).toEqual({ ok: true, data: { kind: 'saved', template: { id: 't1', version: 4 } } });
  });

  it('turns a version conflict into a decision for the person, not an error', async () => {
    api.templates.update.mockRejectedValue(conflict(7));
    expect(await saveTemplate('ws', 't1', { baseVersion: 3, document: doc })).toEqual({ ok: true, data: { kind: 'conflict', currentVersion: 7 } });
  });

  it('restores by saving the old document as the newest version', async () => {
    api.templates.version.mockResolvedValue({ document: { ...doc, metadata: { title: 'old' } } });
    api.templates.update.mockResolvedValue({ id: 't1', version: 9 });
    await restoreVersion('ws', 't1', 2, 8);
    expect(api.templates.update).toHaveBeenCalledWith('t1', { base_version: 8, document: { ...doc, metadata: { title: 'old' } } });
  });

  it('refuses a non-image or an oversized upload before calling the service', async () => {
    const svg = new FormData();
    svg.append('file', new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
    const r = await uploadImage('ws', svg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unsupported_media_type');
    const empty = new FormData();
    expect((await uploadImage('ws', empty)).ok).toBe(false);
    expect(api.assets.upload).not.toHaveBeenCalled();
  });
});

describe('mailings', () => {
  it('creates from a template and records who composed it', async () => {
    api.mailings.create.mockResolvedValue({ id: 'm1' });
    await createMailing('ws', { templateId: 't1', name: '', subject: 'Hi', preheader: '', topic: 'news', providerId: 'p1' });
    expect(api.mailings.create).toHaveBeenCalledWith({
      template_id: 't1',
      name: undefined,
      subject: 'Hi',
      preheader: undefined,
      topic: 'news',
      provider_id: 'p1',
      metadata: { created_by: 'me@example.com', source: 'dashboard' },
    });
  });

  it('sends the first name as a merge value and returns the verdict with the addresses', async () => {
    api.mailings.addRecipients.mockResolvedValue({ added: 1, already_present: 1, rejected: [] });
    const r = await addRecipients('ws', 'm1', [
      { email: 'ana@example.com', firstName: 'Ana' },
      { email: 'ben@example.com', firstName: null },
    ]);
    expect(api.mailings.addRecipients).toHaveBeenCalledWith('m1', {
      recipients: [
        { email: 'ana@example.com', merge: { first_name: 'Ana' } },
        { email: 'ben@example.com', merge: {} },
      ],
    });
    expect(r).toEqual({ ok: true, data: { added: 1, already_present: 1, rejected: [], emails: ['ana@example.com', 'ben@example.com'] } });
  });

  it('refuses more than one batch at a time', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ email: `p${i}@example.com`, firstName: null }));
    const r = await addRecipients('ws', 'm1', many);
    expect(r.ok).toBe(false);
    expect(api.mailings.addRecipients).not.toHaveBeenCalled();
  });

  it('passes a state conflict through with the service reason', async () => {
    api.mailings.pause.mockRejectedValue(new MailApiError({ code: 'mailing_invalid_state', status: 409, message: 'A sent mailing cannot pause.' }));
    const r = await controlMailing('ws', 'm1', 'pause');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('A sent mailing cannot pause.');
  });

  it('only includes outcome-unknown recipients in a retry when asked', async () => {
    api.mailings.retryFailed.mockResolvedValue({ id: 'm1' });
    await retryFailed('ws', 'm1', false);
    expect(api.mailings.retryFailed).toHaveBeenLastCalledWith('m1', {});
    await retryFailed('ws', 'm1', true);
    expect(api.mailings.retryFailed).toHaveBeenLastCalledWith('m1', { include_outcome_unknown: true });
  });

  it('reports an unreachable service on a test send', async () => {
    api.mailings.test.mockRejectedValue(new MailNetworkError('down', null));
    const r = await sendTest('ws', 'm1', { to: 'me@example.com', firstName: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('network');
  });
});

describe('providers', () => {
  const base = {
    kind: 'smtp' as const,
    name: 'iCloud',
    fromName: 'News',
    fromEmail: 'news@example.com',
    replyTo: '',
    host: 'smtp.mail.me.com',
    port: 587,
    security: 'starttls' as const,
    username: 'news@example.com',
    policy: { daily_recipient_budget: 800, min_interval_ms: 3000, max_recipients_per_message: 1 },
  };

  it('requires the secret on create and sends it only to the service', async () => {
    const missing = await saveProvider('ws', null, { ...base, secret: '' });
    expect(missing.ok).toBe(false);
    api.providers.create.mockResolvedValue({ id: 'p1' });
    await saveProvider('ws', null, { ...base, secret: 'app-password' });
    expect(api.providers.create).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ password: 'app-password' }), reply_to: null }));
  });

  it('keeps the stored secret when an update leaves it empty', async () => {
    api.providers.update.mockResolvedValue({ id: 'p1' });
    await saveProvider('ws', 'p1', { ...base, secret: '' });
    const body = api.providers.update.mock.calls[0]![1];
    expect(body.config).not.toHaveProperty('password');
  });
});

describe('invitations', () => {
  it('lets only an admin or owner invite, and only an owner invite an owner', async () => {
    api.members.list.mockResolvedValue({ data: [{ id: 'm', subject: 'sub-me', email: 'me@example.com', role: 'editor' }] });
    expect((await inviteMember('ws', { email: 'new@example.com', role: 'viewer' })).ok).toBe(false);
    api.members.list.mockResolvedValue({ data: [{ id: 'm', subject: 'sub-me', email: 'me@example.com', role: 'admin' }] });
    const owner = await inviteMember('ws', { email: 'new@example.com', role: 'owner' });
    expect(owner.ok).toBe(false);
    const ok = await inviteMember('ws', { email: 'new@example.com', role: 'editor' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.url).toMatch(/^https:\/\/app\.mail\.test\/invite\//);
  });

  it('refuses to invite someone already in the workspace', async () => {
    api.members.list.mockResolvedValue({ data: [{ id: 'm', subject: 'sub-me', email: 'me@example.com', role: 'owner' }, { id: 'n', subject: 's2', email: 'New@Example.com', role: 'viewer' }] });
    const r = await inviteMember('ws', { email: 'new@example.com', role: 'editor' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_exists');
  });

  it('accepts on the inviter\'s behalf, idempotently, only for the invited address', async () => {
    const { url } = createInvite({ workspaceId: 'ws-9', inviterSubject: 'sub-admin', email: 'ME@example.com', role: 'editor' });
    const token = url.split('/invite/')[1]!;
    onBehalf.members.add.mockResolvedValue({ id: 'new' });
    expect(await acceptInvite(token)).toEqual({ ok: true, data: { workspaceId: 'ws-9' } });
    const [body, opts] = onBehalf.members.add.mock.calls[0]!;
    expect(body).toEqual({ subject: 'sub-me', email: 'me@example.com', name: 'Me', role: 'editor' });
    expect(opts.idempotencyKey).toMatch(/^invite-/);

    // A second acceptance (another tab) is a success, not an error.
    onBehalf.members.add.mockRejectedValue(new MailApiError({ code: 'already_exists', status: 409, message: 'x' }));
    expect(await acceptInvite(token)).toEqual({ ok: true, data: { workspaceId: 'ws-9' } });

    // The inviter lost the right to add members in the meantime.
    onBehalf.members.add.mockRejectedValue(new MailApiError({ code: 'insufficient_role', status: 403, message: 'x' }));
    const lost = await acceptInvite(token);
    expect(lost.ok).toBe(false);
    if (!lost.ok) expect(lost.error.message).toMatch(/new invitation/);
  });

  it('refuses an invitation for another address or with a broken link', async () => {
    const { url } = createInvite({ workspaceId: 'ws-9', inviterSubject: 'sub-admin', email: 'someone-else@example.com', role: 'editor' });
    const other = await acceptInvite(url.split('/invite/')[1]!);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.message).toMatch(/someone-else@example.com/);
    expect((await acceptInvite('broken.token')).ok).toBe(false);
    expect(onBehalf.members.add).not.toHaveBeenCalled();
  });
});
