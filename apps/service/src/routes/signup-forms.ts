import {
  SignupSubmission,
  type SignupForm,
  type SignupFormCreate,
  type TemplateDocument,
} from '@marlinjai/mail-contract';
import { Hono, type Context } from 'hono';
import { ApiError } from '../api-error.js';
import { actorOf, type AppEnv, type WorkspaceAccess } from '../context.js';
import type { Db, Sql } from '../db.js';
import { validateDocument } from '../documents.js';
import { mount, type MountDeps } from '../mount.js';
import { offeredLocales, PAGE_LOCALES } from '../pages/i18n.js';
import { escapeHtml } from '../pages/render.js';
import { st } from '../pages/signup-render.js';
import { repos, type Repos } from '../repo/index.js';
import type { SignupFormInput, SignupFormRow } from '../repo/signup.js';
import type { CompiledDocument } from './mailings.js';
import { clientIp } from '../signup/client-ip.js';
import type { SignupService } from '../signup/service.js';
import { body, pageArgs, params, query, rawJson, rowId, toPage } from '../validate.js';

export type SignupFormRouteDeps = MountDeps & {
  compile: (document: TemplateDocument) => Promise<CompiledDocument>;
  publicBaseUrl: string;
  /** Null when the instance has no signing key: submissions are then refused as unavailable. */
  service: SignupService | null;
};

/** `{{confirm_url}}`, with or without spaces or a fallback. */
const CONFIRM_URL_FIELD = /\{\{\s*confirm_url\s*(\|[^}]*)?\}\}/;

export function toSignupForm(row: SignupFormRow): SignupForm {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    consent_text: row.consent_text,
    translations: row.translations,
    topics: row.topics,
    tags: row.tags,
    fields: row.fields,
    double_opt_in: true,
    provider_id: row.provider_id,
    confirmation_template_id: row.confirmation_template_id,
    redirect_url: row.redirect_url,
    allowed_origins: row.allowed_origins,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function notFound(): never {
  throw new ApiError('not_found', 'No such signup form in this workspace.');
}

/** An origin exactly: scheme, host and port, nothing after. `https://x.de/` is accepted as `https://x.de`. */
export function normaliseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * CORS for the browser-facing submission route: only a form's own
 * `allowed_origins` may read the answer. Anything else gets no CORS headers,
 * so the browser withholds the response.
 */
export function corsHeaders(form: Pick<SignupFormRow, 'allowed_origins'> | null, origin: string | undefined): Record<string, string> {
  const base = { vary: 'Origin' };
  if (!form || !origin || !form.allowed_origins.includes(origin)) return base;
  return {
    ...base,
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST',
    'access-control-allow-headers': 'content-type, idempotency-key, x-request-id',
    'access-control-max-age': '600',
  };
}

/**
 * Signup forms: CRUD for admins, reads and the embed snippet for everyone in
 * the workspace, and the public JSON submission. The hosted pages
 * (`/f/...`) are in src/routes/signup-pages.ts and share src/signup/service.ts.
 */
export function signupFormRoutes(sql: Sql, deps: SignupFormRouteDeps) {
  const app = new Hono<AppEnv>();
  const { pool } = deps;
  const base = deps.publicBaseUrl.replace(/\/+$/, '');
  const formId = (c: Context<AppEnv>) => rowId(params(c, 'signupForms.get').id, 'signup form');

  /** Checks a create or update against the workspace and compiles the confirmation template. */
  async function resolveInput(r: Repos, workspaceId: string, input: SignupFormCreate): Promise<SignupFormInput> {
    const issues: { path: (string | number)[]; message: string }[] = [];
    const topics = [...new Set(input.topics)];
    const found = await r.topics.bySlugs(workspaceId, topics);
    if (found.length !== topics.length) {
      const known = new Set(found.map((t) => t.slug));
      const unknown = topics.filter((s) => !known.has(s));
      throw new ApiError('unknown_topic', `No such topic in this workspace: ${unknown.join(', ')}.`, { topics: unknown });
    }
    const tags = [...new Set(input.tags ?? [])];
    const foundTags = await r.tags.bySlugs(workspaceId, tags);
    if (foundTags.length !== tags.length) {
      const known = new Set(foundTags.map((t) => t.slug));
      for (const [i, slug] of tags.entries()) if (!known.has(slug)) issues.push({ path: ['tags', i], message: `no tag "${slug}" in this workspace` });
    }
    for (const locale of Object.keys(input.translations ?? {})) {
      if (!(PAGE_LOCALES as readonly string[]).includes(locale)) {
        issues.push({ path: ['translations', locale], message: `the hosted page has no ${locale} version; use one of ${PAGE_LOCALES.join(', ')}` });
      }
    }
    const origins: string[] = [];
    for (const [i, value] of (input.allowed_origins ?? []).entries()) {
      const origin = normaliseOrigin(value);
      if (!origin) issues.push({ path: ['allowed_origins', i], message: 'must be an origin: scheme, host and port, no path' });
      else if (!origins.includes(origin)) origins.push(origin);
    }
    if (issues.length > 0) throw new ApiError('validation_failed', 'The signup form is not valid.', { issues });

    const providerId = /^[0-9a-f-]{36}$/i.test(input.provider_id) ? input.provider_id.toLowerCase() : null;
    if (!providerId || !(await r.providers.get(workspaceId, providerId))) {
      throw new ApiError('unknown_provider', 'No such provider in this workspace.', { provider_id: input.provider_id });
    }

    let templateId: string | null = null;
    let html: string | null = null;
    if (input.confirmation_template_id) {
      templateId = rowId(input.confirmation_template_id, 'template');
      const template = await r.templates.get(workspaceId, templateId);
      if (!template) throw new ApiError('not_found', 'No such template in this workspace.', { confirmation_template_id: templateId });
      const compiled = await deps.compile(
        validateDocument(template.document, ['confirmation_template_id']) as unknown as TemplateDocument,
      );
      if (compiled.errors.length > 0) {
        throw new ApiError('compile_failed', 'The confirmation template does not compile.', { errors: compiled.errors });
      }
      if (!CONFIRM_URL_FIELD.test(compiled.html)) {
        throw new ApiError('validation_failed', 'The confirmation template must contain {{confirm_url}}.', {
          issues: [{ path: ['confirmation_template_id'], message: 'the template has no {{confirm_url}} link' }],
        });
      }
      html = compiled.html;
    }

    return {
      name: input.name,
      title: input.title,
      consentText: input.consent_text,
      translations: input.translations ?? {},
      topics,
      tags,
      fields: [...new Set(input.fields ?? [])],
      providerId,
      confirmationTemplateId: templateId,
      confirmationHtml: html,
      redirectUrl: input.redirect_url ?? null,
      allowedOrigins: origins,
    };
  }

  async function audit(r: Repos, access: WorkspaceAccess, action: 'signup_form.created' | 'signup_form.updated' | 'signup_form.deleted', row: Pick<SignupFormRow, 'id' | 'version'>) {
    await r.audit.record(access.workspaceId, {
      action,
      actor: actorOf(access),
      targetType: 'signup_form',
      targetId: row.id,
      details: { version: row.version },
    });
  }

  mount(app, 'signupForms.list', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const q = query(c, 'signupForms.list');
    const page = await pageArgs(q, async (id) => (await pool.signup.getForm(workspaceId, id)) !== null);
    const rows = await pool.signup.listForms(workspaceId, { ...page, limit: page.limit + 1 });
    const { data, next_cursor } = toPage(rows, page.limit);
    return c.json({ data: data.map(toSignupForm), next_cursor });
  });

  mount(app, 'signupForms.create', deps, async (c) => {
    const access = c.get('access');
    const input = await body(c, 'signupForms.create');
    const form = await sql.begin(async (tx) => {
      const r = repos(tx);
      const row = await r.signup.createForm(access.workspaceId, await resolveInput(r, access.workspaceId, input));
      await audit(r, access, 'signup_form.created', row);
      return toSignupForm(row);
    });
    return c.json(form, 201);
  });

  mount(app, 'signupForms.get', deps, async (c) => {
    const row = await pool.signup.getForm(c.get('access').workspaceId, formId(c));
    if (!row) notFound();
    return c.json(toSignupForm(row));
  });

  mount(app, 'signupForms.update', deps, async (c) => {
    const access = c.get('access');
    const id = formId(c);
    const input = await body(c, 'signupForms.update');
    const form = await sql.begin(async (tx) => {
      const r = repos(tx);
      if (!(await r.signup.getForm(access.workspaceId, id))) notFound();
      const row = await r.signup.updateForm(access.workspaceId, id, await resolveInput(r, access.workspaceId, input));
      if (!row) notFound();
      await audit(r, access, 'signup_form.updated', row);
      return toSignupForm(row);
    });
    return c.json(form);
  });

  mount(app, 'signupForms.delete', deps, async (c) => {
    const access = c.get('access');
    const id = formId(c);
    await sql.begin(async (tx: Db) => {
      const r = repos(tx);
      const row = await r.signup.getForm(access.workspaceId, id);
      if (!row || !(await r.signup.softDeleteForm(access.workspaceId, id))) notFound();
      await audit(r, access, 'signup_form.deleted', row);
    });
    return c.json({ ok: true as const });
  });

  mount(app, 'signupForms.embed', deps, async (c) => {
    const { workspaceId } = c.get('access');
    const row = await pool.signup.getForm(workspaceId, formId(c));
    if (!row) notFound();
    const workspace = (await pool.workspaces.get(workspaceId))!;
    const locale = offeredLocales(workspace.settings)[0]!;
    const hosted = `${base}/f/${row.id}`;
    return c.json({
      hosted_url: hosted,
      html: embedHtml(row, hosted, locale),
      script_url: `${hosted}/embed.js`,
      token_url: `${hosted}/token`,
    });
  });

  // The public submission. Registered through mount like every route; its
  // access is `public`, so no credential is asked for (authenticate in app.ts
  // lets public routes pass).
  mount(app, 'signupForms.submit', deps, async (c) => {
    const id = params(c, 'signupForms.submit').id;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
    const form = uuid ? await pool.signup.findFormForPublic(uuid) : null;
    for (const [k, v] of Object.entries(corsHeaders(form, c.req.header('origin')))) c.header(k, v);
    const raw = await rawJson(c);
    // A filled honeypot is a bot: answered like a success, so it learns nothing.
    const honeypot = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).website : undefined;
    if (typeof honeypot === 'string' && honeypot !== '') {
      console.log(`[signup] form ${uuid ?? 'unknown'}: honeypot filled, submission ignored`);
      return c.json({ ok: true as const }, 202);
    }
    const parsed = SignupSubmission.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError('validation_failed', 'The request body is not valid.', {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    if (!deps.service) throw new ApiError('service_unavailable', 'Signup is not configured on this instance.');
    if (!form) return c.json({ ok: true as const }, 202);
    const outcome = await deps.service.submit(form, parsed.data, clientIp(c), c.req.header('accept-language'));
    if (outcome === 'rate_limited') {
      throw new ApiError('rate_limited', 'Too many signups from here in a short time. Try again later.');
    }
    return c.json({ ok: true as const }, 202);
  });

  // The preflight of the submission, for a browser on an allowed origin.
  app.options('/v1/signup-forms/:id/submit', async (c) => {
    const id = c.req.param('id') ?? '';
    const form = /^[0-9a-f-]{36}$/i.test(id) ? await pool.signup.findFormForPublic(id.toLowerCase()) : null;
    return c.body(null, 204, corsHeaders(form, c.req.header('origin')));
  });

  return app;
}

/**
 * A plain HTML form that posts to the hosted page and works without
 * JavaScript. Its `form_token` is empty: posted like that, the hosted page asks
 * for one more click; with the optional script, the token is filled in and the
 * post goes straight through.
 */
function embedHtml(form: SignupFormRow, action: string, locale: (typeof PAGE_LOCALES)[number]): string {
  const id = `lumitra-${form.id.slice(0, 8)}`;
  const field = (name: string, type: string, label: string, autocomplete: string, required: boolean) =>
    `  <p><label for="${id}-${name}">${label}</label><br>` +
    `<input id="${id}-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}"${required ? ' required' : ''}></p>\n`;
  return (
    `<form action="${escapeHtml(action)}" method="post" accept-charset="utf-8" data-lumitra-form="${form.id}">\n` +
    field('email', 'email', st(locale, 'email_label'), 'email', true) +
    (form.fields.includes('first_name') ? field('first_name', 'text', st(locale, 'first_name_label'), 'given-name', false) : '') +
    (form.fields.includes('last_name') ? field('last_name', 'text', st(locale, 'last_name_label'), 'family-name', false) : '') +
    `  <div aria-hidden="true" style="position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden">` +
    `<label for="${id}-website">${st(locale, 'honeypot_label')}</label>` +
    `<input id="${id}-website" name="website" type="text" tabindex="-1" autocomplete="off" value=""></div>\n` +
    `  <input type="hidden" name="form_token" value="">\n` +
    `  <input type="hidden" name="lang" value="${locale}">\n` +
    `  <p>${escapeHtml(form.translations[locale]?.consent_text ?? form.consent_text)}</p>\n` +
    `  <p><button type="submit">${st(locale, 'submit_button')}</button></p>\n` +
    `</form>`
  );
}
