// A stand-in compile worker for the pool's unit tests. It speaks the real
// worker's protocol; the document says how to misbehave:
//   { spin: true }   never answers (busy loop), to exercise the deadline
//   { crash: true }  exits the thread mid-job, to exercise replacement
//   { sleep: ms }    answers after blocking for ms
//   anything else    answers at once with an empty result
// An import (`kind: 'import'`) of the MJML "spin" never answers; any other MJML
// answers at once with an empty document.
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ id, kind, document, mjml }) => {
  if (kind === 'import') {
    if (mjml === 'spin') for (;;);
    parentPort.postMessage({ id, ok: true, result: { document: { version: '1.0', metadata: {}, sections: [] }, warnings: [] } });
    return;
  }
  if (document?.spin) for (;;);
  if (document?.crash) process.exit(3);
  if (document?.sleep) {
    const until = Date.now() + document.sleep;
    while (Date.now() < until);
  }
  parentPort.postMessage({ id, ok: true, result: { mjml: '<mjml></mjml>', html: '<html></html>', errors: document?.errors ?? [] } });
});
parentPort.postMessage({ ready: true });
