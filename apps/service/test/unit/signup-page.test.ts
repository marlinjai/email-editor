import { createHash } from 'node:crypto';
import axe from 'axe-core';
import { JSDOM, type DomDocument } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { PAGE_LOCALES, type PageLocale } from '../../src/pages/i18n.js';
import { CONTENT_SECURITY_POLICY, contentSecurityPolicy } from '../../src/pages/render.js';
import { SIGNUP_MESSAGES } from '../../src/pages/signup-i18n.js';
import {
  renderConfirmationMail,
  renderSignupForm,
  renderSignupMessage,
  type SignupFormView,
  type SignupMessageKind,
} from '../../src/pages/signup-render.js';
import { corsHeaders, normaliseOrigin } from '../../src/routes/signup-forms.js';
import { isPublicRequest } from '../../src/app.js';
import { createPurposeSigner } from '../../src/platform/tokens.js';
import { createSignupService } from '../../src/signup/service.js';

function formView(locale: PageLocale, patch: Partial<SignupFormView> = {}): SignupFormView {
  return {
    locale,
    offered: PAGE_LOCALES,
    path: '/f/11111111-1111-4111-8111-111111111111',
    workspaceName: 'ŌPUNTIA',
    title: 'Stay in touch',
    consentText: 'I agree to receive the programme updates.',
    fields: ['first_name', 'last_name'],
    values: {},
    formToken: 'v1.abc.def',
    ...patch,
  };
}

const KINDS: SignupMessageKind[] = ['check', 'confirm', 'confirmed', 'already', 'expired', 'superseded', 'gone', 'invalid', 'rate', 'error'];

function allPages(locale: PageLocale): Array<[string, string]> {
  return [
    ['form', renderSignupForm(formView(locale))],
    ['form: prompt', renderSignupForm(formView(locale, { prompt: true, values: { email: 'a@b.de', first_name: 'Ada' } }))],
    ['form: errors', renderSignupForm(formView(locale, { errors: { email: true, name: true }, values: { email: 'nope' } }))],
    ['form: email only', renderSignupForm(formView(locale, { fields: [] }))],
    ...KINDS.map(
      (kind) =>
        [
          `message: ${kind}`,
          renderSignupMessage({
            kind,
            locale,
            offered: PAGE_LOCALES,
            path: '/f/confirm/tok',
            workspaceName: kind === 'invalid' || kind === 'error' ? null : 'ŌPUNTIA',
            email: 'ada@example.com',
            confirmPath: '/f/confirm/tok',
            formPath: '/f/11111111-1111-4111-8111-111111111111',
            paused: kind === 'confirmed',
          }),
        ] as [string, string],
    ),
  ];
}

describe('translations', () => {
  const english = SIGNUP_MESSAGES.en;
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(PAGE_LOCALES)('%s has every key, non-empty, with the same placeholders as English', (locale) => {
    const messages = SIGNUP_MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(messages)) {
      expect(value.trim(), `${locale}.${key}`).not.toBe('');
      expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(english[key as keyof typeof english]));
    }
  });

  it('uses no en dash or em dash anywhere', () => {
    for (const locale of PAGE_LOCALES) {
      for (const [key, value] of Object.entries(SIGNUP_MESSAGES[locale])) {
        expect(/[\u2013\u2014]/.test(value), `${locale}.${key}`).toBe(false);
      }
    }
  });

  it('is formal in German, Italian and Spanish', () => {
    const joined = (l: PageLocale) => Object.values(SIGNUP_MESSAGES[l]).join(' ');
    expect(joined('de')).toMatch(/\bSie\b/);
    expect(joined('de')).not.toMatch(/\b(du|dich|dein|deine)\b/i);
    expect(joined('it')).toMatch(/\bLei\b/);
    expect(joined('es')).not.toMatch(/\b(tú|tu)\b/i);
  });
});

describe('rendering', () => {
  it('escapes every value from a workspace or a person', () => {
    const html = renderSignupForm(
      formView('en', {
        workspaceName: '<script>alert(1)</script>',
        title: '"><img src=x onerror=alert(1)>',
        consentText: '<b>bold</b>',
        values: { email: '"><script>x</script>' },
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>bold');
  });

  it('starts with a UTF-8 charset, is not indexed, loads nothing and carries its own stylesheet hash', () => {
    for (const [, html] of allPages('fr')) {
      expect(html).toMatch(/^<!doctype html><html lang="fr"><head><meta charset="utf-8">/);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).not.toMatch(/<script|<img|<link|<iframe/i);
    }
    const css = /<style>([\s\S]*?)<\/style>/.exec(renderSignupForm(formView('en')))![1]!;
    expect(CONTENT_SECURITY_POLICY).toContain(`style-src 'sha256-${createHash('sha256').update(css).digest('base64')}'`);
  });

  it('extends form-action by exactly one redirect origin', () => {
    expect(contentSecurityPolicy('https://studio.example')).toContain("form-action 'self' https://studio.example;");
    expect(contentSecurityPolicy()).toContain("form-action 'self';");
  });

  it('keeps the honeypot out of reach: off-screen, hidden from assistive technology, out of the tab order', () => {
    const doc = new JSDOM(renderSignupForm(formView('en'))).window.document;
    const hp = doc.querySelector('input[name=website]')!;
    expect(hp.closest('[aria-hidden=true]')!.getAttribute('class')).toBe('hp');
    expect(hp.getAttribute('tabindex')).toBe('-1');
    expect(hp.getAttribute('autocomplete')).toBe('off');
    expect(doc.querySelector('input[name=form_token]')!.value).toBe('v1.abc.def');
  });

  it('renders the built-in confirmation mail with the link as a button and written out', () => {
    const url = 'https://mail.test/f/confirm/v1.a&b.c';
    const mail = renderConfirmationMail({ locale: 'it', workspaceName: 'ŌPUNTIA', confirmUrl: url });
    expect(mail.subject).toBe('Confermi la Sua iscrizione a ŌPUNTIA');
    expect(mail.html).toContain('href="https://mail.test/f/confirm/v1.a&amp;b.c"');
    expect(mail.html).toMatch(/^<!doctype html><html lang="it"><head><meta charset="utf-8">/);
    expect(mail.text).toContain(url);
  });
});

describe('helpers', () => {
  it('normalises origins and refuses anything with a path', () => {
    expect(normaliseOrigin('https://x.de/')).toBe('https://x.de');
    expect(normaliseOrigin('https://x.de:8443')).toBe('https://x.de:8443');
    expect(normaliseOrigin('https://x.de/a')).toBeNull();
    expect(normaliseOrigin('ftp://x.de')).toBeNull();
    expect(normaliseOrigin('https://x.de/?q=1')).toBeNull();
  });

  it('gives CORS headers only to an allowed origin', () => {
    const form = { allowed_origins: ['https://x.de'] };
    expect(corsHeaders(form, 'https://x.de')['access-control-allow-origin']).toBe('https://x.de');
    expect(corsHeaders(form, 'https://y.de')['access-control-allow-origin']).toBeUndefined();
    expect(corsHeaders(null, 'https://x.de')['access-control-allow-origin']).toBeUndefined();
  });

  it('treats exactly the contract public routes as public, preflights included', () => {
    const path = '/v1/signup-forms/11111111-1111-4111-8111-111111111111/submit';
    expect(isPublicRequest('POST', path)).toBe(true);
    expect(isPublicRequest('OPTIONS', path)).toBe(true);
    expect(isPublicRequest('GET', '/v1/signup-forms/11111111-1111-4111-8111-111111111111')).toBe(false);
    expect(isPublicRequest('OPTIONS', '/v1/mailings')).toBe(false);
  });

  it('checks the form token: its form, not too soon, not too late, genuine', () => {
    const keys = new Map([[1, Buffer.alloc(32, 3)]]);
    let now = new Date('2026-09-18T12:00:00Z');
    const service = createSignupService({ sql: null as never, keys, options: { now: () => now } });
    const form = '11111111-1111-4111-8111-111111111111';
    const token = service.formToken(form);
    expect(service.checkFormToken(form, token)).toBe('too_fast');
    now = new Date(now.getTime() + 3_000);
    expect(service.checkFormToken(form, token)).toBe('ok');
    expect(service.checkFormToken('22222222-2222-4222-8222-222222222222', token)).toBe('invalid');
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    expect(service.checkFormToken(form, token)).toBe('stale');
    expect(service.checkFormToken(form, undefined)).toBe('invalid');
    // A token of another purpose, even signed with the same root key, does not pass.
    expect(service.checkFormToken(form, createPurposeSigner(keys, 'track-open').sign(`${form}.${now.getTime() - 5000}`))).toBe('invalid');
  });
});

describe('accessibility (axe-core, WCAG 2.2 A and AA rules)', () => {
  async function violations(html: string) {
    const dom = new JSDOM(html, { pretendToBeVisual: true });
    const result = await axe.run(dom.window.document.documentElement as never, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    dom.window.close();
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }

  it.each(PAGE_LOCALES)('%s: every page state has no violations', async (locale) => {
    for (const [name, html] of allPages(locale)) {
      expect(await violations(html), `${locale} ${name}`).toEqual([]);
    }
  });

  it('the confirmation mail has no violations', async () => {
    const mail = renderConfirmationMail({ locale: 'de', workspaceName: 'ŌPUNTIA', confirmUrl: 'https://mail.test/f/confirm/x' });
    expect(await violations(mail.html)).toEqual([]);
  });
});
