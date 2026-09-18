import { describe, expect, it } from 'vitest';
import { createAddressHasher, createPurposeSigner } from '../../src/platform/tokens.js';
import { applyTracking, classifyClick, classifyOpen, createTrackingTokens, extractLinks } from '../../src/platform/tracking.js';
import { checkProperties, coerceCsvValue, propertyTypeError } from '../../src/platform/properties.js';

const KEYS = new Map([[1, Buffer.alloc(32, 3)]]);
const W = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';

describe('purpose signers', () => {
  it('verify their own tokens only, and refuse tampering, other purposes and unknown key versions', () => {
    const a = createPurposeSigner(KEYS, 'signup-confirm');
    const b = createPurposeSigner(KEYS, 'track-open');
    const token = a.sign('abc.123');
    expect(a.verify(token)).toBe('abc.123');
    expect(b.verify(token)).toBeNull();
    expect(a.verify(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(a.verify(token.replace(/^v1\./, 'v2.'))).toBeNull();
    expect(a.verify('x'.repeat(2000))).toBeNull();
    expect(a.verify('')).toBeNull();
  });

  it('verify under an older key version after a rotation', () => {
    const old = createPurposeSigner(KEYS, 'track-click').sign('p');
    const rotated = createPurposeSigner(new Map([...KEYS, [2, Buffer.alloc(32, 4)]]), 'track-click');
    expect(rotated.verify(old)).toBe('p');
    expect(rotated.sign('p').startsWith('v2.')).toBe(true);
  });

  it('hash addresses stably without revealing them', () => {
    const hash = createAddressHasher(KEYS);
    expect(hash('203.0.113.9')).toBe(hash(' 203.0.113.9 '));
    expect(hash('203.0.113.9')).not.toContain('203');
    expect(hash('203.0.113.9')).not.toBe(hash('203.0.113.10'));
  });
});

describe('tracking tokens', () => {
  const t = createTrackingTokens(KEYS);
  it('round-trip and keep open and click apart', () => {
    expect(t.verifyOpen(t.open({ workspaceId: W, mailingId: M, recipientId: R }))).toEqual({ workspaceId: W, mailingId: M, recipientId: R });
    const click = t.click({ workspaceId: W, mailingId: M, recipientId: R, linkIdx: 7 });
    expect(t.verifyClick(click)).toEqual({ workspaceId: W, mailingId: M, recipientId: R, linkIdx: 7 });
    expect(t.verifyOpen(click)).toBeNull();
  });
});

describe('links and the pixel', () => {
  const html = `<html><body><a href="https://x.org/a?b=1&amp;c=2">x</a> <a class="k" href='https://x.org/b'>y</a>
    <a href="{{unsubscribe_url}}">u</a> <a href="https://x.org/p/{{first_name}}">p</a> <a href="mailto:a@b.de">m</a>
    <a href="https://x.org/a?b=1&amp;c=2">again</a></body></html>`;

  it('numbers plain absolute links once, never merge-field or mailto links', () => {
    expect(extractLinks(html)).toEqual(['https://x.org/a?b=1&c=2', 'https://x.org/b']);
  });

  it('rewrites only numbered links and puts the pixel before </body>', () => {
    const out = applyTracking(html.replace('{{first_name}}', 'Ada').replace('{{unsubscribe_url}}', 'https://mail.test/u/t'), {
      openUrl: 'https://mail.test/t/o/T',
      clickUrl: (i) => `https://mail.test/t/c/${i}`,
      links: new Map([
        ['https://x.org/a?b=1&c=2', 0],
        ['https://x.org/b', 1],
      ]),
    });
    expect(out.match(/href="https:\/\/mail\.test\/t\/c\/0"/g)).toHaveLength(2);
    expect(out).toContain(`href='https://mail.test/t/c/1'`);
    expect(out).toContain('href="https://mail.test/u/t"');
    expect(out).toContain('href="https://x.org/p/Ada"');
    expect(out).toMatch(/<img src="https:\/\/mail\.test\/t\/o\/T"[^>]*\/><\/body>/);
  });

  it('changes nothing without tracking', () => {
    expect(applyTracking(html, { openUrl: null, clickUrl: null, links: new Map([['https://x.org/b', 0]]) })).toBe(html);
  });
});

describe('who opened', () => {
  it('flags scanners, a missing agent and Apple Mail Privacy Protection', () => {
    expect(classifyOpen('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', '198.51.100.4')).toEqual({ isMachine: false, isAppleMpp: false });
    expect(classifyOpen('Mozilla/5.0', '198.51.100.4')).toEqual({ isMachine: false, isAppleMpp: true });
    expect(classifyOpen('Mozilla/5.0 (Windows NT 10.0)', '17.58.1.2')).toEqual({ isMachine: false, isAppleMpp: true });
    expect(classifyOpen('Mimecast Security Scanner', undefined).isMachine).toBe(true);
    expect(classifyOpen(undefined, undefined).isMachine).toBe(true);
    // Gmail's image proxy fetches on a real open.
    expect(classifyOpen('Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)', undefined).isMachine).toBe(false);
  });

  it('treats a click in the first seconds after delivery as a scanner', () => {
    expect(classifyClick('Mozilla/5.0 (Macintosh)', 1_000).isMachine).toBe(true);
    expect(classifyClick('Mozilla/5.0 (Macintosh)', 60_000).isMachine).toBe(false);
    expect(classifyClick('Mozilla/5.0 (Macintosh)', null).isMachine).toBe(false);
  });
});

describe('typed properties', () => {
  it('checks each type, and null always passes', () => {
    expect(propertyTypeError('number', 3)).toBeNull();
    expect(propertyTypeError('number', '3')).toMatch(/number/);
    expect(propertyTypeError('boolean', 'yes')).toMatch(/true or false/);
    expect(propertyTypeError('date', '2026-09-18')).toBeNull();
    expect(propertyTypeError('date', '2026-09-18T10:00:00Z')).toBeNull();
    expect(propertyTypeError('date', '18.09.2026')).toMatch(/ISO/);
    expect(propertyTypeError('string', null)).toBeNull();
  });

  it('reports only defined keys, with their path', () => {
    const issues = checkProperties(new Map([['age', 'number']]), { age: 'old', free: { any: 1 } });
    expect(issues).toEqual([{ path: ['properties', 'age'], message: 'age must be a number (defined as number)' }]);
  });

  it('turns CSV text into typed values', () => {
    expect(coerceCsvValue('number', ' 3,5 ')).toEqual({ value: 3.5 });
    expect(coerceCsvValue('number', 'abc')).toEqual({ error: 'is not a number' });
    expect(coerceCsvValue('boolean', 'Ja')).toEqual({ error: 'is not true or false' });
    expect(coerceCsvValue('boolean', 'YES')).toEqual({ value: true });
    expect(coerceCsvValue(undefined, '  x ')).toEqual({ value: 'x' });
    expect(coerceCsvValue('date', '')).toBeUndefined();
  });
});
