import { missingRequiredMergeFields } from '@marlinjai/mail-contract';
import { describe, expect, it } from 'vitest';
import { createInProcessCompiler } from '../../src/worker/compile.js';
import { invalidForCore, newsletter, withoutUnsubscribe } from '../support/mail-documents.js';

describe('in-process compile adapter', () => {
  const compiler = createInProcessCompiler();

  it('compiles a document and keeps its merge fields for the worker', async () => {
    const result = await compiler.compile(newsletter());
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain('<mjml');
    expect(result.html).toContain('{{first_name|there}}');
    expect(result.html).toContain('href="{{unsubscribe_url}}"');
    expect(missingRequiredMergeFields(result.html)).toEqual([]);
  });

  it('shows a missing unsubscribe link', async () => {
    const result = await compiler.compile(withoutUnsubscribe());
    expect(missingRequiredMergeFields(result.html)).toEqual(['unsubscribe_url']);
  });

  it('answers a document the core rejects with errors, never a throw', async () => {
    const result = await compiler.compile(invalidForCore());
    expect(result.html).toBe('');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toMatch(/\S/);
  });
});
