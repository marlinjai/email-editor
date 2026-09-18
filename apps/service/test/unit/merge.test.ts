import { describe, expect, it } from 'vitest';
import {
  listUnsubscribeHeaders,
  mergeHtml,
  mergeSubject,
  unsubscribeUrl,
  type MergeContext,
} from '../../src/worker/merge.js';

const ctx = (over: Partial<MergeContext> = {}): MergeContext => ({
  email: 'ada@example.com',
  merge: {},
  contact: { first_name: 'Ada', last_name: 'Lovelace', properties: { city: 'London' } },
  unsubscribeUrl: 'https://mail.lumitra.co/u/tok.sig',
  ...over,
});

describe('merge fields', () => {
  it('fills reserved fields and properties, recipient values first', () => {
    const html = '<p>Hi {{first_name}} {{ last_name }} from {{city}} ({{email}})</p><a href="{{unsubscribe_url}}">x</a>';
    expect(mergeHtml(html, ctx({ merge: { first_name: 'Augusta' } }))).toBe(
      '<p>Hi Augusta Lovelace from London (ada@example.com)</p><a href="https://mail.lumitra.co/u/tok.sig">x</a>',
    );
  });

  it('uses the fallback when there is no value, and nothing when there is no fallback', () => {
    const none = ctx({ contact: null });
    expect(mergeHtml('Hi {{first_name|there}}, {{nickname}}!', none)).toBe('Hi there, !');
    expect(mergeHtml('Hi {{first_name|there}}', ctx({ merge: { first_name: '  ' } }))).toBe('Hi there');
  });

  it('HTML-escapes every value, fallbacks included', () => {
    const evil = ctx({ merge: { first_name: '<script>alert(1)</script>', note: 'a "q" & \'s\'' } });
    expect(mergeHtml('{{first_name}} {{note}} {{missing|<b>}}', evil)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; a &quot;q&quot; &amp; &#39;s&#39; &lt;b&gt;',
    );
  });

  it('ignores objects and lists as values, prints numbers and booleans', () => {
    expect(mergeHtml('{{a}}|{{b}}|{{c}}|{{d|x}}', ctx({ merge: { a: 3, b: true, c: { x: 1 }, d: [1] } }))).toBe('3|true||x');
  });

  it('does not escape the subject, but strips anything that could add a header', () => {
    expect(mergeSubject('News for {{first_name}}', ctx({ merge: { first_name: 'A & B\r\nBcc: x@y.z' } }))).toBe(
      'News for A & B Bcc: x@y.z',
    );
  });

  it('builds the hosted page URL and the one-click headers', () => {
    const url = unsubscribeUrl('https://mail.lumitra.co/', 'abc.def');
    expect(url).toBe('https://mail.lumitra.co/u/abc.def');
    expect(listUnsubscribeHeaders(url, 'hello@example.com')).toEqual({
      'List-Unsubscribe': '<https://mail.lumitra.co/u/abc.def>, <mailto:hello@example.com?subject=unsubscribe>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
