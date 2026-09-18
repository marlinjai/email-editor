import { createHash } from 'node:crypto';
import axe from 'axe-core';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { chooseLocale, MESSAGES, offeredLocales, PAGE_LOCALES, parseAcceptLanguage, type PageLocale } from '../../src/pages/i18n.js';
import {
  CONTENT_SECURITY_POLICY,
  escapeHtml,
  maskEmail,
  renderMessage,
  renderPreferences,
  type PreferencesView,
  type TopicView,
} from '../../src/pages/render.js';

const topics: TopicView[] = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Programme updates', description: 'What is on next month.', state: 'subscribed' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Venue outreach', description: null, state: 'unsubscribed' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Press', description: null, state: 'paused' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Newsletter', description: null, state: 'not_subscribed' },
];

function view(locale: PageLocale, patch: Partial<PreferencesView> = {}): PreferencesView {
  return {
    locale,
    offered: PAGE_LOCALES,
    path: '/u/abc.def',
    workspaceName: 'ŌPUNTIA',
    maskedEmail: maskEmail('marlin@example.com'),
    mailTopic: topics[0]!,
    topics,
    all: 'open',
    isTest: false,
    ...patch,
  };
}

/** Every page state the route can render, for the checks that must hold on all of them. */
function allPages(locale: PageLocale): Array<[string, string]> {
  return [
    ['manage', renderPreferences(view(locale))],
    ['done: unsubscribed topic', renderPreferences(view(locale, { outcome: { kind: 'unsubscribed', topic: topics[0]! } }))],
    ['done: unsubscribed all', renderPreferences(view(locale, { all: 'unsubscribed', outcome: { kind: 'unsubscribed', topic: null } }))],
    ['done: resubscribed topic', renderPreferences(view(locale, { outcome: { kind: 'resubscribed', topic: topics[1]! } }))],
    ['all paused', renderPreferences(view(locale, { all: 'paused' }))],
    ['no topics', renderPreferences(view(locale, { topics: [], mailTopic: null }))],
    ['test preview', renderPreferences(view(locale, { isTest: true, maskedEmail: null, outcome: { kind: 'test' } }))],
    ['gone', renderMessage({ kind: 'gone', locale, offered: PAGE_LOCALES })],
    ['invalid', renderMessage({ kind: 'invalid', locale, offered: PAGE_LOCALES })],
    ['cross site', renderMessage({ kind: 'cross_site', locale, offered: PAGE_LOCALES })],
    ['error', renderMessage({ kind: 'error', locale, offered: PAGE_LOCALES })],
  ];
}

describe('translations', () => {
  const english = MESSAGES.en;
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(PAGE_LOCALES)('%s has every key, non-empty, with the same placeholders as English', (locale) => {
    const messages = MESSAGES[locale];
    expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(messages)) {
      expect(value.trim(), `${locale}.${key}`).not.toBe('');
      // `action_*_topic` carry only the topic in German, which reads as one phrase with the verb.
      if (!key.startsWith('action_')) {
        expect(placeholders(value), `${locale}.${key}`).toEqual(placeholders(english[key as keyof typeof english]));
      }
    }
  });

  it('uses no en dash or em dash anywhere', () => {
    for (const locale of PAGE_LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(/[\u2013\u2014]/.test(value), `${locale}.${key}`).toBe(false);
      }
    }
  });

  it('is formal in German and Spanish and British in English', () => {
    const joined = (l: PageLocale) => Object.values(MESSAGES[l]).join(' ');
    expect(joined('de')).toMatch(/\bSie\b/);
    expect(joined('de')).not.toMatch(/\b(du|dich|dein|deine)\b/i);
    expect(joined('es')).not.toMatch(/\b(tú|tu|te has)\b/i);
    expect(joined('en')).not.toMatch(/\b(color|favorite)\b/);
  });
});

describe('locale choice', () => {
  const offered = ['de', 'en', 'fr'] as const;

  it('offers the workspace locales it has translations for, default first, English as the floor', () => {
    expect(offeredLocales({ default_locale: 'de', locales: ['en', 'de', 'pt'] })).toEqual(['de', 'en']);
    expect(offeredLocales({ default_locale: 'de-AT', locales: ['de-AT', 'it'] })).toEqual(['de', 'it']);
    expect(offeredLocales({ default_locale: 'pt', locales: ['pt'] })).toEqual(['en']);
  });

  it('parses Accept-Language by quality, dropping q=0 and wildcards', () => {
    expect(parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5')).toEqual(['fr', 'fr', 'en', 'de']);
    expect(parseAcceptLanguage('en;q=0.2, de')).toEqual(['de', 'en']);
    expect(parseAcceptLanguage('es;q=0, it')).toEqual(['it']);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });

  it('prefers an explicit choice, then the browser, then the contact, then the workspace default', () => {
    expect(chooseLocale({ offered, explicit: 'fr', acceptLanguage: 'en', contactLocale: 'de' })).toBe('fr');
    expect(chooseLocale({ offered, explicit: 'xx', acceptLanguage: 'en-GB', contactLocale: 'de' })).toBe('en');
    expect(chooseLocale({ offered, acceptLanguage: 'ja, pt', contactLocale: 'fr-FR' })).toBe('fr');
    expect(chooseLocale({ offered, acceptLanguage: 'ja' })).toBe('de');
    // A language the workspace does not offer is never chosen, even explicitly.
    expect(chooseLocale({ offered, explicit: 'it' })).toBe('de');
  });
});

describe('rendering', () => {
  it('masks the address', () => {
    expect(maskEmail('marlin@example.com')).toBe('m•••n@e•••.com');
    expect(maskEmail('ab@x.de')).toBe('a•••@x•••.de');
    expect(maskEmail('not-an-address')).toBe('•••');
  });

  it('escapes every value from a workspace', () => {
    const html = renderPreferences(
      view('en', {
        workspaceName: '<script>alert(1)</script>',
        topics: [{ ...topics[0]!, name: '"><img src=x onerror=alert(1)>' }],
        mailTopic: { ...topics[0]!, name: '"><img src=x onerror=alert(1)>' },
      }),
    );
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img');
    expect(html).toContain(escapeHtml('<script>alert(1)</script>'));
  });

  it('starts with a UTF-8 charset, is not indexed, and needs no script', () => {
    for (const [, html] of allPages('de')) {
      expect(html).toMatch(/^<!doctype html><html lang="de"><head><meta charset="utf-8">/);
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html).not.toMatch(/<script|<img|<link|<iframe|https?:\/\//i);
    }
  });

  it('allows exactly its own stylesheet in the Content-Security-Policy', () => {
    const html = renderPreferences(view('en'));
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    const hash = createHash('sha256').update(css).digest('base64');
    expect(CONTENT_SECURITY_POLICY).toContain(`style-src 'sha256-${hash}'`);
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline');
  });

  it('gives every per-topic button a distinct accessible name', () => {
    const dom = new JSDOM(renderPreferences(view('en', { topics: topics.map((t) => ({ ...t, state: 'subscribed' as const })) })));
    const names = [...dom.window.document.querySelectorAll('li button')].map((b) => b.textContent);
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).toBe('Unsubscribe from Programme updates');
  });

  it('offers the undo on the confirmation', () => {
    const dom = new JSDOM(renderPreferences(view('en', { outcome: { kind: 'unsubscribed', topic: topics[0]! } })));
    const undo = dom.window.document.querySelector('[role=status] form')!;
    const field = (n: string) => (undo.querySelector(`input[name=${n}]`) as HTMLInputElement | null)?.value;
    expect([field('action'), field('scope'), field('topic')]).toEqual(['resubscribe', 'topic', topics[0]!.id]);
  });
});

describe('accessibility (axe-core, WCAG 2.2 A and AA rules)', () => {
  // jsdom does not lay out, so axe cannot compute contrast there; the palette is
  // checked separately below.
  async function violations(html: string) {
    const dom = new JSDOM(html, { pretendToBeVisual: true });
    const result = await axe.run(dom.window.document.documentElement as unknown as Element, {
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

  it('meets AA contrast for text on every surface, in both schemes', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      ) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
      return (x + 0.05) / (y + 0.05);
    };
    const css = /<style>([\s\S]*?)<\/style>/.exec(renderPreferences(view('en')))![1]!;
    const schemes = css.match(/:root\{[^}]*\}/g)!.map((block) =>
      Object.fromEntries([...block.matchAll(/--([\w-]+):(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]])),
    );
    expect(schemes).toHaveLength(2);
    for (const s of schemes) {
      for (const bg of [s.bg, s.surface, s['ok-bg'], s['note-bg']]) {
        expect(ratio(s.text!, bg!)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(s.muted!, bg!)).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(s['on-ink']!, s.ink!)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(s.focus!, s.surface!)).toBeGreaterThanOrEqual(3);
      expect(ratio(s.ink!, s.surface!)).toBeGreaterThanOrEqual(3);
    }
  });
});
