import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Email, Id, JsonValue, Ok, PageQuery, Properties, Slug, Timestamp, page } from './common';
import { ERROR_CODES, ERROR_STATUS, ErrorBody, RETRYABLE_ERRORS, errorBody, statusForError } from './errors';
import { TS, TS_OFFSET } from './test-fixtures';

describe('common', () => {
  it('Id accepts opaque strings and rejects empty or oversized ones', () => {
    expect(Id.safeParse('mlg_01J8').success).toBe(true);
    expect(Id.safeParse('').success).toBe(false);
    expect(Id.safeParse('x'.repeat(65)).success).toBe(false);
    expect(Id.safeParse(12).success).toBe(false);
  });

  it('Timestamp accepts ISO strings with Z or an offset, and rejects dates and loose strings', () => {
    expect(Timestamp.safeParse(TS).success).toBe(true);
    expect(Timestamp.safeParse(TS_OFFSET).success).toBe(true);
    expect(Timestamp.safeParse('2026-09-18').success).toBe(false);
    expect(Timestamp.safeParse('yesterday').success).toBe(false);
    expect(Timestamp.safeParse(new Date()).success).toBe(false);
  });

  it('Email accepts addresses, trims them, and rejects garbage', () => {
    expect(Email.parse('  ada@example.com ')).toBe('ada@example.com');
    expect(Email.safeParse('ada@').success).toBe(false);
    expect(Email.safeParse('not an email').success).toBe(false);
    expect(Email.safeParse(`${'a'.repeat(250)}@x.de`).success).toBe(false);
  });

  it('Slug takes lowercase words joined by single hyphens', () => {
    expect(Slug.safeParse('programme-updates').success).toBe(true);
    expect(Slug.safeParse('venue2').success).toBe(true);
    for (const bad of ['Programme', 'a--b', '-a', 'a-', 'a b', '', 'ä']) {
      expect(Slug.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('JsonValue and Properties accept nested JSON and reject non-JSON values', () => {
    expect(JsonValue.safeParse({ a: [1, 'x', null, { b: false }] }).success).toBe(true);
    expect(Properties.safeParse({ a: 1 }).success).toBe(true);
    expect(Properties.safeParse({ a: undefined }).success).toBe(false);
    expect(Properties.safeParse({ a: () => 1 }).success).toBe(false);
    expect(Properties.safeParse([1]).success).toBe(false);
  });

  it('PageQuery coerces a query-string limit and enforces 1..100', () => {
    expect(PageQuery.parse({ limit: '25' })).toEqual({ limit: 25 });
    expect(PageQuery.parse({})).toEqual({});
    expect(PageQuery.safeParse({ limit: '0' }).success).toBe(false);
    expect(PageQuery.safeParse({ limit: '101' }).success).toBe(false);
    expect(PageQuery.safeParse({ limit: '2.5' }).success).toBe(false);
    expect(PageQuery.safeParse({ cursor: '' }).success).toBe(false);
  });

  it('page() wraps items and requires next_cursor (null on the last page)', () => {
    const P = page(z.object({ id: Id }));
    expect(P.safeParse({ data: [{ id: 'a' }], next_cursor: 'c2' }).success).toBe(true);
    expect(P.safeParse({ data: [], next_cursor: null }).success).toBe(true);
    expect(P.safeParse({ data: [] }).success).toBe(false);
    expect(P.safeParse({ data: [{ id: '' }], next_cursor: null }).success).toBe(false);
  });

  it('Ok is exactly { ok: true }', () => {
    expect(Ok.safeParse({ ok: true }).success).toBe(true);
    expect(Ok.safeParse({ ok: false }).success).toBe(false);
  });
});

describe('errors', () => {
  it('maps every code to an HTTP error status', () => {
    for (const code of ERROR_CODES) {
      const status = statusForError(code);
      expect(status, code).toBeGreaterThanOrEqual(400);
      expect(status, code).toBeLessThan(600);
    }
    expect(ERROR_STATUS.mailing_invalid_state).toBe(409);
    expect(ERROR_STATUS.missing_unsubscribe_url).toBe(422);
    expect(ERROR_STATUS.validation_failed).toBe(400);
    expect(ERROR_STATUS.not_found).toBe(404);
  });

  it('builds and parses the envelope, with and without details', () => {
    expect(ErrorBody.parse(errorBody('not_found', 'No such mailing'))).toEqual({
      error: { code: 'not_found', message: 'No such mailing' },
    });
    const withDetails = errorBody('validation_failed', 'Invalid body', { issues: [{ path: ['email'], message: 'x' }] });
    expect(ErrorBody.safeParse(withDetails).success).toBe(true);
  });

  it('rejects unknown codes, empty messages and a bare error string', () => {
    expect(ErrorBody.safeParse({ error: { code: 'teapot', message: 'x' } }).success).toBe(false);
    expect(ErrorBody.safeParse({ error: { code: 'not_found', message: '' } }).success).toBe(false);
    expect(ErrorBody.safeParse({ error: 'not_found' }).success).toBe(false);
  });

  it('marks only transient failures retryable', () => {
    expect(RETRYABLE_ERRORS).toContain('rate_limited');
    expect(RETRYABLE_ERRORS).not.toContain('validation_failed');
    expect(RETRYABLE_ERRORS).not.toContain('mailing_invalid_state');
  });
});
