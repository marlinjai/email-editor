// The MJML compile worker: one per slot of the compile pool (src/compile/pool.ts).
//
// Plain JavaScript on purpose: the same file runs unchanged under the test
// runner, under `tsx` in development and from dist/ in production, so no
// loader has to follow it into a worker thread. It only ever receives documents
// that already passed validation (migrateTemplate) on the main thread.
//
// Protocol: in `{ id, document, options }` (options as the core's
// `MJMLCompiler.compile` takes them, e.g. `{ webFonts: false }`), out `{ id, ok: true, result: { mjml, html,
// errors } }` or `{ id, ok: false, error }`.

import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('compile-worker.js must run in a worker thread');
// mjml's dependency tree still requires Node's deprecated `punycode`, which
// would print the same warning once per worker (and again for every
// replacement). It says nothing about this service, so it is silenced here,
// in the worker only, before mjml loads.
process.noDeprecation = true;
const { createMJMLCompiler } = await import('@marlinjai/email-editor-core/server');
const port = parentPort;
const compiler = createMJMLCompiler();

port.on('message', (/** @type {{ id: number, document: unknown, options?: { webFonts?: boolean } }} */ message) => {
  try {
    const result = compiler.compile(/** @type {any} */ (message.document), message.options ?? {});
    port.postMessage({
      id: message.id,
      ok: true,
      result: { mjml: result.mjml, html: result.html, errors: result.errors ?? [] },
    });
  } catch (err) {
    port.postMessage({ id: message.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

port.postMessage({ ready: true });
