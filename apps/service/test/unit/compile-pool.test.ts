import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api-error.js';
import { CompilePool, toCompileMessage } from '../../src/compile/pool.js';
import { brokenSpacerDocument, helloDocument } from '../support/documents.js';

const REAL_WORKER = new URL('../../src/compile-worker.js', import.meta.url);
const SPIN_WORKER = new URL('../support/spin-worker.js', import.meta.url);

let pools: CompilePool[] = [];
afterEach(async () => {
  await Promise.all(pools.map((p) => p.close()));
  pools = [];
});
function pool(options: Partial<ConstructorParameters<typeof CompilePool>[0]> = {}) {
  const p = new CompilePool({ workerUrl: SPIN_WORKER, size: 1, timeoutMs: 5_000, maxQueue: 4, ...options });
  pools.push(p);
  return p;
}

describe('toCompileMessage', () => {
  it("keeps MJML's line and tag and drops the server's file path", () => {
    const raw = 'Line 13 of /srv/app/apps/service (mj-spacer) \u2014 Attribute height has invalid value: abc for type Unit';
    const msg = toCompileMessage(raw);
    expect(msg).toEqual({ message: 'mj-spacer: Attribute height has invalid value: abc for type Unit', line: 13, path: 'mj-spacer' });
    expect(JSON.stringify(msg)).not.toContain('/srv/app');
  });

  it('passes an unrecognised message through, never an empty one', () => {
    expect(toCompileMessage('Something odd')).toEqual({ message: 'Something odd' });
    expect(toCompileMessage('  ')).toEqual({ message: 'Unknown compilation error.' });
  });
});

describe('CompilePool with the real MJML worker', () => {
  it('compiles a document to MJML and HTML with no errors', async () => {
    const p = pool({ workerUrl: REAL_WORKER });
    const result = await p.compile(helloDocument());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.mjml).toContain('<mjml>');
    expect(result.html).toContain('Hello, world');
  });

  it('reports MJML validation problems as errors, still with the output', async () => {
    const p = pool({ workerUrl: REAL_WORKER });
    const result = await p.compile(brokenSpacerDocument());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ path: 'mj-spacer', line: expect.any(Number) });
    expect(result.errors[0]!.message).toMatch(/height/);
    expect(result.mjml).toContain('mj-spacer');
  });
});

describe('CompilePool isolation', () => {
  it('stops a compile that misses its deadline, answers with an error, and keeps serving', async () => {
    const p = pool({ timeoutMs: 300 });
    const started = Date.now();
    const result = await p.compile({ spin: true });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(result.html).toBe('');
    expect(result.errors[0]!.message).toMatch(/did not finish within 300 ms/);
    // The spinning worker was replaced: the next job is served.
    const next = await p.compile({});
    expect(next.errors).toEqual([]);
  });

  it('refuses work beyond the queue with a retryable service_unavailable', async () => {
    const p = pool({ maxQueue: 1 });
    const running = p.compile({ sleep: 400 });
    // Wait until the first job occupies the only worker.
    for (let i = 0; i < 100 && p.stats().running === 0; i++) await new Promise((r) => setTimeout(r, 20));
    const queued = p.compile({});
    const refused = p.compile({});
    await expect(refused).rejects.toBeInstanceOf(ApiError);
    await expect(refused).rejects.toMatchObject({ code: 'service_unavailable', status: 503 });
    await expect(running).resolves.toMatchObject({ errors: [] });
    await expect(queued).resolves.toMatchObject({ errors: [] });
  });

  it('fails the job of a worker that dies, replaces the worker, and serves the next job', async () => {
    const logged: unknown[] = [];
    const p = pool({ log: { error: (...a: unknown[]) => logged.push(a) } });
    await expect(p.compile({ crash: true })).rejects.toThrow(/exited with code 3/);
    await expect(p.compile({})).resolves.toMatchObject({ errors: [] });
    expect(logged.length).toBeGreaterThan(0);
  });

  it('runs jobs on several workers at once', async () => {
    const p = pool({ size: 3 });
    const started = Date.now();
    await Promise.all([p.compile({ sleep: 400 }), p.compile({ sleep: 400 }), p.compile({ sleep: 400 })]);
    expect(Date.now() - started).toBeLessThan(1_100);
  });

  it('rejects waiting and new jobs once closed', async () => {
    const p = pool();
    const running = expect(p.compile({ sleep: 300 })).rejects.toMatchObject({ code: 'service_unavailable' });
    await p.close();
    await running;
    await expect(p.compile({})).rejects.toMatchObject({ code: 'service_unavailable' });
  });
});
