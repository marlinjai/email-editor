import { Email } from '@marlinjai/mail-contract';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from '../context.js';
import type { Sql } from '../db.js';
import { chooseLocale, offeredLocales, PAGE_LOCALES, type PageLocale } from '../pages/i18n.js';
import { contentSecurityPolicy } from '../pages/render.js';
import { renderSignupForm, renderSignupMessage, type SignupMessageKind } from '../pages/signup-render.js';
import { repos } from '../repo/index.js';
import type { SignupFormRow } from '../repo/signup.js';
import type { Workspace } from '../repo/workspaces.js';
import { clientIp } from '../signup/client-ip.js';
import type { SignupService } from '../signup/service.js';
import { corsHeaders } from './signup-forms.js';

/**
 * The hosted signup pages, public and outside `/v1` like the unsubscribe page:
 *
 * - `GET /f/<id>`: the form, localised, with a fresh form token (the time check).
 * - `POST /f/<id>`: a submission, form-encoded, from this page or a no-JS embed
 *   on the workspace's own site (so a foreign Origin is expected here). A post
 *   without a valid, fresh token (the static embed carries none) is not refused:
 *   the form comes back prefilled with a fresh token and asks for one more click.
 *   Every accepted-looking post ends on the same "check your inbox" page.
 * - `GET /f/<id>/token`: a fresh token as JSON for the embed script (CORS for the
 *   form's `allowed_origins`). `GET /f/<id>/embed.js`: that script.
 * - `GET /f/confirm/<token>`: shows a confirm button and writes nothing, so a
 *   link scanner opening the mail's link confirms nobody. `POST` confirms.
 *
 * No page ever reports whether an address was already on the list.
 */

const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SignupPageDeps = {
  service: SignupService;
  /** The service's public origin; the embed script fetches its token from here. */
  publicBaseUrl: string;
  log?: Pick<Console, 'error' | 'log'>;
};

function securityHeaders(csp = contentSecurityPolicy()): Record<string, string> {
  return {
    'content-security-policy': csp,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

type Form = Record<string, string | File | (string | File)[]>;

function field(form: Form, name: string): string | undefined {
  const v = form[name];
  return typeof v === 'string' ? v : undefined;
}

export function signupPageRoutes(sql: Sql, deps: SignupPageDeps) {
  const app = new Hono<AppEnv>();
  const pool = repos(sql);
  const { service } = deps;
  const log = deps.log ?? console;

  app.use(
    '/f/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.html(renderSignupMessage({ kind: 'invalid', locale: 'en', offered: PAGE_LOCALES, path: null, workspaceName: null }), 413, securityHeaders()),
    }),
  );

  function locale(c: Context<AppEnv>, workspace: Workspace | null, explicit?: string): { locale: PageLocale; offered: PageLocale[] } {
    const offered = workspace ? offeredLocales(workspace.settings) : [...PAGE_LOCALES];
    return {
      offered,
      locale: chooseLocale({ offered, explicit: explicit ?? c.req.query('lang'), acceptLanguage: c.req.header('accept-language') }),
    };
  }

  function message(
    c: Context<AppEnv>,
    status: number,
    kind: SignupMessageKind,
    workspace: Workspace | null,
    extra: { explicit?: string; path?: string | null; email?: string; formPath?: string; confirmPath?: string; paused?: boolean; csp?: string } = {},
  ) {
    const l = locale(c, workspace, extra.explicit);
    const html = renderSignupMessage({
      kind,
      ...l,
      path: extra.path ?? null,
      workspaceName: workspace?.name ?? null,
      email: extra.email,
      formPath: extra.formPath,
      confirmPath: extra.confirmPath,
      paused: extra.paused,
    });
    return c.html(html, status as 200, securityHeaders(extra.csp));
  }

  /** Any failure becomes a page, never a stack trace. */
  function page(what: string, handler: (c: Context<AppEnv>) => Promise<Response>) {
    return async (c: Context<AppEnv>) => {
      try {
        return await handler(c);
      } catch (err) {
        log.error(`[${c.get('requestId')}] ${c.req.method} ${what} failed:`, err);
        return message(c, 500, 'error', null);
      }
    };
  }

  async function loadForm(id: string | undefined): Promise<{ form: SignupFormRow; workspace: Workspace } | null> {
    if (!id || !UUID.test(id)) return null;
    const form = await pool.signup.findFormForPublic(id.toLowerCase());
    if (!form) return null;
    const workspace = await pool.workspaces.get(form.workspace_id);
    return workspace ? { form, workspace } : null;
  }

  function formPage(
    c: Context<AppEnv>,
    status: number,
    loaded: { form: SignupFormRow; workspace: Workspace },
    opts: { explicit?: string; values?: { email?: string; first_name?: string; last_name?: string }; prompt?: boolean; errors?: { email?: boolean; name?: boolean } } = {},
  ) {
    const { form, workspace } = loaded;
    const l = locale(c, workspace, opts.explicit);
    const translated = form.translations[l.locale];
    const html = renderSignupForm({
      ...l,
      path: `/f/${form.id}`,
      workspaceName: workspace.name,
      title: translated?.title ?? form.title,
      consentText: translated?.consent_text ?? form.consent_text,
      fields: form.fields,
      values: opts.values ?? {},
      formToken: service.formToken(form.id),
      prompt: opts.prompt,
      errors: opts.errors,
    });
    return c.html(html, status as 200, securityHeaders());
  }

  // Confirmation first: `/f/confirm/<token>` must not be read as a form id.
  app.get(
    '/f/confirm/:token',
    page('/f/confirm/<token>', async (c) => {
      const token = c.req.param('token') ?? '';
      const state = await service.inspect(token);
      const path = `/f/confirm/${token}`;
      switch (state.kind) {
        case 'invalid':
          return message(c, 400, 'invalid', null);
        case 'gone':
          return message(c, 410, 'gone', state.workspace);
        case 'expired':
          return message(c, 410, 'expired', state.workspace, { formPath: `/f/${state.form.id}` });
        case 'superseded':
          return message(c, 410, 'superseded', state.workspace);
        case 'already':
          return message(c, 200, 'already', state.workspace, { path });
        case 'open': {
          // The redirect after confirming leaves this origin: form-action must allow it.
          const target = state.form.redirect_url ? new URL(state.form.redirect_url).origin : undefined;
          return message(c, 200, 'confirm', state.workspace, {
            path,
            confirmPath: path,
            explicit: c.req.query('lang') ?? state.submission.locale,
            csp: contentSecurityPolicy(target),
          });
        }
      }
    }),
  );

  app.post(
    '/f/confirm/:token',
    page('/f/confirm/<token>', async (c) => {
      // The token in the path is the credential, as on the unsubscribe page;
      // there is nothing a cross-site post could do that holding the link cannot.
      const token = c.req.param('token') ?? '';
      const form = await readForm(c);
      const explicit = form ? field(form, 'lang') : undefined;
      const outcome = await service.confirm(token, clientIp(c));
      switch (outcome.kind) {
        case 'invalid':
          return message(c, 400, 'invalid', null, { explicit });
        case 'gone':
          return message(c, 410, 'gone', outcome.workspace, { explicit });
        case 'expired':
          return message(c, 410, 'expired', outcome.workspace, { explicit, formPath: `/f/${outcome.form.id}` });
        case 'superseded':
          return message(c, 410, 'superseded', outcome.workspace, { explicit });
        case 'already':
          return message(c, 200, 'already', outcome.workspace, { explicit });
        case 'confirmed':
          if (outcome.form.redirect_url && !outcome.paused) return c.redirect(outcome.form.redirect_url, 303);
          return message(c, 200, 'confirmed', outcome.workspace, { explicit, paused: outcome.paused });
      }
    }),
  );

  app.get('/f/:id/token', async (c) => {
    const loaded = await loadForm(c.req.param('id'));
    const headers = { ...corsHeaders(loaded?.form ?? null, c.req.header('origin')), 'cache-control': 'no-store' };
    if (!loaded) return c.json({ error: { code: 'not_found', message: 'No such signup form.' } }, 404, headers);
    const issued = service.now();
    return c.json(
      {
        form_token: service.formToken(loaded.form.id, issued),
        not_before: new Date(issued.getTime() + service.options.minFillMs).toISOString(),
        expires_at: new Date(issued.getTime() + service.options.maxTokenAgeMs).toISOString(),
      },
      200,
      headers,
    );
  });

  app.get('/f/:id/embed.js', async (c) => {
    const loaded = await loadForm(c.req.param('id'));
    if (!loaded) return c.text('/* no such signup form */', 404, { 'content-type': 'text/javascript; charset=utf-8' });
    const id = JSON.stringify(loaded.form.id);
    const tokenUrl = JSON.stringify(`${deps.publicBaseUrl.replace(/\/+$/, '')}/f/${loaded.form.id}/token`);
    // Fills the embed's hidden form_token so its post passes the time check at
    // once. If the token cannot be fetched the form still works: the hosted page
    // then asks for one more click, which is the designed fallback, not an error.
    const script =
      `(function(){var f=document.querySelector('form[data-lumitra-form="'+${id}+'"]');if(!f||!window.fetch)return;` +
      `fetch(${tokenUrl},{credentials:'omit'}).then(function(r){if(!r.ok)throw new Error('token '+r.status);return r.json()})` +
      `.then(function(d){var i=f.querySelector('input[name="form_token"]');if(i&&d&&d.form_token)i.value=d.form_token})` +
      `.catch(function(){})})();`;
    return c.body(script, 200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
  });

  app.get(
    '/f/:id',
    page('/f/<id>', async (c) => {
      const loaded = await loadForm(c.req.param('id'));
      if (!loaded) return message(c, 404, 'gone', null);
      return formPage(c, 200, loaded);
    }),
  );

  app.post(
    '/f/:id',
    page('/f/<id>', async (c) => {
      const loaded = await loadForm(c.req.param('id'));
      const form = await readForm(c);
      const explicit = form ? field(form, 'lang') : undefined;
      if (!loaded) return message(c, 404, 'gone', null, { explicit });
      if (!form) return formPage(c, 400, loaded, { explicit });
      const values = {
        email: (field(form, 'email') ?? '').trim(),
        first_name: field(form, 'first_name'),
        last_name: field(form, 'last_name'),
      };
      const honeypot = field(form, 'website');
      // A bot filling the honeypot sees the same page a person would.
      if (honeypot) {
        log.log(`[signup] form ${loaded.form.id}: honeypot filled, submission ignored`);
        return message(c, 200, 'check', loaded.workspace, { explicit, email: values.email });
      }
      const emailOk = Email.safeParse(values.email).success;
      const namesOk = (values.first_name ?? '').length <= 200 && (values.last_name ?? '').length <= 200;
      if (!emailOk || !namesOk) {
        return formPage(c, 400, loaded, { explicit, values, errors: { email: !emailOk, name: !namesOk } });
      }
      const outcome = await service.submit(
        loaded.form,
        { ...values, form_token: field(form, 'form_token'), locale: explicit },
        clientIp(c),
        c.req.header('accept-language'),
      );
      if (outcome === 'needs_token') return formPage(c, 200, loaded, { explicit, values, prompt: true });
      if (outcome === 'rate_limited') return message(c, 429, 'rate', loaded.workspace, { explicit });
      return message(c, 200, 'check', loaded.workspace, { explicit, email: values.email });
    }),
  );

  return app;
}

async function readForm(c: Context<AppEnv>): Promise<Form | null> {
  const type = c.req.header('content-type') ?? '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type)) return null;
  try {
    return (await c.req.parseBody({ all: true })) as Form;
  } catch {
    return null;
  }
}
