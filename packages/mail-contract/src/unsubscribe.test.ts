import { describe, expect, it } from 'vitest';
import { RESERVED_MERGE_FIELDS, findMergeFields, missingRequiredMergeFields } from './unsubscribe';

describe('merge fields', () => {
  it('reserves first_name with a fallback and requires unsubscribe_url for broadcasts', () => {
    expect(RESERVED_MERGE_FIELDS.first_name.fallback).toBe(true);
    expect(RESERVED_MERGE_FIELDS.unsubscribe_url.required_for_broadcast).toBe(true);
    const required = Object.entries(RESERVED_MERGE_FIELDS).filter(([, v]) => v.required_for_broadcast);
    expect(required.map(([k]) => k)).toEqual(['unsubscribe_url']);
  });

  it('finds fields with and without fallbacks, tolerating spaces', () => {
    const html = '<p>Hi {{ first_name | there }},</p><p>{{gathering_title}}</p><a href="{{unsubscribe_url}}">x</a>';
    expect(findMergeFields(html)).toEqual([
      { name: 'first_name', fallback: 'there' },
      { name: 'gathering_title', fallback: null },
      { name: 'unsubscribe_url', fallback: null },
    ]);
  });

  it('ignores things that are not merge fields', () => {
    expect(findMergeFields('{{}} {{ 1abc }} {first_name} {{First}}')).toEqual([]);
  });

  it('keeps an empty fallback distinct from none', () => {
    expect(findMergeFields('{{first_name|}}')).toEqual([{ name: 'first_name', fallback: '' }]);
  });

  it('a document without an unsubscribe link is not sendable as a broadcast', () => {
    expect(missingRequiredMergeFields('<p>Hi {{first_name}}</p>')).toEqual(['unsubscribe_url']);
    expect(missingRequiredMergeFields('<a href="{{unsubscribe_url}}">Abmelden</a>')).toEqual([]);
    expect(missingRequiredMergeFields('')).toEqual(['unsubscribe_url']);
  });

  it('is safe to call repeatedly (no shared regex state)', () => {
    const html = '{{unsubscribe_url}}';
    expect(missingRequiredMergeFields(html)).toEqual([]);
    expect(missingRequiredMergeFields(html)).toEqual([]);
  });
});
