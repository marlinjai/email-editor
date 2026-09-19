import { Worker } from 'node:worker_threads';
import type { CompileMessage, CompileResult, ImportWarning, MjmlImportRefusal, TemplateDocument } from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';

/**
 * Compiling a document with MJML is synchronous and, for a large document,
 * takes long enough to stall every other request if it ran on the main thread.
 * So it never does: a fixed pool of worker threads (src/compile-worker.js)
 * compiles, the main thread only waits.
 *
 * - Each job has a deadline. A worker that misses it is terminated (the only way
 *   to stop synchronous code) and replaced, and the caller receives a result
 *   whose `errors` say so, since the contract answers every compile with 200.
 * - Jobs beyond the busy workers wait in a bounded queue. When the queue is
 *   full the call fails fast with `service_unavailable` (503, retryable) instead
 *   of growing memory without bound under a burst.
 * - A worker that dies (a crash, running out of memory) fails its job with an
 *   internal error and is replaced; the pool keeps serving.
 */

/** Per-compile options, passed to the core's `MJMLCompiler.compile`. */
export type CompileOptions = {
  /** `false` leaves out MJML's automatic Google Fonts imports (the `service_only` asset policy). */
  webFonts?: boolean;
};

export interface Compiler {
  compile(document: unknown, options?: CompileOptions): Promise<CompileResult>;
}

/** An MJML source read into an editor document (the core's `importMjml`), off the request thread. */
export type ImportedMjml = { document: TemplateDocument; warnings: ImportWarning[] };

export interface MjmlImporter {
  /**
   * Rejects with `invalid_mjml` (422, `details.reason`, `line`, `column`) when
   * the MJML cannot be imported, `too_complex` when it misses the deadline.
   */
  importMjml(mjml: string): Promise<ImportedMjml>;
}

type ImportFailure = { code: MjmlImportRefusal | 'too_large'; message: string; line?: number; column?: number };

/** The typed refusal for MJML the core could not import. */
export function importRefusal(failure: ImportFailure): ApiError {
  if (failure.code === 'too_large') return new ApiError('payload_too_large', failure.message);
  const details: Record<string, unknown> = { reason: failure.code };
  if (failure.line !== undefined) details.line = failure.line;
  if (failure.column !== undefined) details.column = failure.column;
  return new ApiError('invalid_mjml', failure.message, details);
}

export type CompilePoolOptions = {
  /** The worker script: src/compile-worker.js, or dist/compile-worker.js when built. */
  workerUrl: URL;
  /** Worker threads, each compiling one document at a time. */
  size: number;
  /** Deadline for one compile, from the moment a worker starts it. */
  timeoutMs: number;
  /** Jobs allowed to wait for a free worker before new ones are refused. */
  maxQueue: number;
  log?: Pick<Console, 'error'>;
};

type RawResult = { mjml: string; html: string; errors: string[] };
type Reply =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error?: string; importError?: ImportFailure }
  | { ready: true };

type Job = { id: number; reject: (e: unknown) => void } & (
  | { kind: 'compile'; document: unknown; options: CompileOptions; resolve: (r: CompileResult) => void }
  | { kind: 'import'; mjml: string; resolve: (r: ImportedMjml) => void }
);

type Slot = {
  worker: Worker;
  ready: boolean;
  job: Job | null;
  timer: NodeJS.Timeout | null;
  /** Set when this slot's worker is being replaced, so its exit is expected. */
  retired: boolean;
};

// MJML formats a message as "Line 13 of <file path> (mj-spacer) <U+2014> Attribute ...".
// The path is the server's working directory, which a client must never see.
const MJML_MESSAGE = /^Line (\d+) of .*? \((mj-[a-z-]+)\) — (.*)$/s;

/** One MJML message in the contract's shape, without the server's file path. */
export function toCompileMessage(raw: string): CompileMessage {
  const m = MJML_MESSAGE.exec(raw);
  if (!m) return { message: raw.trim() || 'Unknown compilation error.' };
  return { message: `${m[2]}: ${m[3]!.trim()}`, line: Number(m[1]), path: m[2] };
}

export function toCompileResult(raw: RawResult): CompileResult {
  return { mjml: raw.mjml, html: raw.html, warnings: [], errors: raw.errors.map(toCompileMessage) };
}

export class CompilePool implements Compiler, MjmlImporter {
  private readonly slots: Slot[] = [];
  private readonly queue: Job[] = [];
  private nextId = 1;
  private closed = false;

  constructor(private readonly options: CompilePoolOptions) {
    if (options.size < 1) throw new Error('a compile pool needs at least one worker');
    for (let i = 0; i < options.size; i++) this.slots.push(this.spawn());
  }

  compile(document: unknown, options: CompileOptions = {}): Promise<CompileResult> {
    const refused = this.refusal();
    if (refused) return Promise.reject(refused);
    return new Promise<CompileResult>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, kind: 'compile', document, options, resolve, reject });
      this.dispatch();
    });
  }

  importMjml(mjml: string): Promise<ImportedMjml> {
    const refused = this.refusal();
    if (refused) return Promise.reject(refused);
    return new Promise<ImportedMjml>((resolve, reject) => {
      this.queue.push({ id: this.nextId++, kind: 'import', mjml, resolve, reject });
      this.dispatch();
    });
  }

  /** Why a new job cannot be queued right now, if it cannot. */
  private refusal(): ApiError | null {
    if (this.closed) return new ApiError('service_unavailable', 'The service is shutting down.');
    const busy = this.slots.every((s) => s.job !== null || !s.ready);
    if (busy && this.queue.length >= this.options.maxQueue) {
      return new ApiError('service_unavailable', 'Too many compilations are waiting. Retry in a few seconds.', {
        queued: this.queue.length,
      });
    }
    return null;
  }

  /** Jobs waiting for a worker, and workers busy with one. For tests and logs. */
  stats(): { queued: number; running: number; workers: number } {
    return {
      queued: this.queue.length,
      running: this.slots.filter((s) => s.job !== null).length,
      workers: this.slots.length,
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.reject(new ApiError('service_unavailable', 'The service is shutting down.'));
    }
    await Promise.all(
      this.slots.map(async (slot) => {
        slot.retired = true;
        if (slot.timer) clearTimeout(slot.timer);
        slot.job?.reject(new ApiError('service_unavailable', 'The service is shutting down.'));
        slot.job = null;
        await slot.worker.terminate();
      }),
    );
  }

  private spawn(): Slot {
    const worker = new Worker(this.options.workerUrl);
    const slot: Slot = { worker, ready: false, job: null, timer: null, retired: false };

    worker.on('message', (reply: Reply) => {
      if ('ready' in reply) {
        slot.ready = true;
        this.dispatch();
        return;
      }
      const job = slot.job;
      if (!job || job.id !== reply.id) return; // a late answer to a job that already timed out
      if (slot.timer) clearTimeout(slot.timer);
      slot.timer = null;
      slot.job = null;
      if (reply.ok) {
        if (job.kind === 'compile') job.resolve(toCompileResult(reply.result as RawResult));
        else job.resolve(reply.result as ImportedMjml);
      } else if (reply.importError && job.kind === 'import') {
        job.reject(importRefusal(reply.importError));
      } else {
        job.reject(new Error(`compile worker failed: ${reply.error}`));
      }
      this.dispatch();
    });

    const replace = (reason: string, err?: unknown) => {
      if (slot.retired) return;
      slot.retired = true;
      if (slot.timer) clearTimeout(slot.timer);
      const job = slot.job;
      slot.job = null;
      this.options.log?.error(`[compile] worker ${reason}; replacing it`, err ?? '');
      job?.reject(new Error(`compile worker ${reason}`));
      void worker.terminate();
      if (this.closed) return;
      const index = this.slots.indexOf(slot);
      if (index >= 0) this.slots[index] = this.spawn();
    };
    worker.on('error', (err) => replace('crashed', err));
    worker.on('exit', (code) => replace(`exited with code ${code}`));
    return slot;
  }

  private dispatch(): void {
    for (const slot of this.slots) {
      if (this.queue.length === 0) return;
      if (!slot.ready || slot.job !== null || slot.retired) continue;
      const job = this.queue.shift()!;
      slot.job = job;
      slot.timer = setTimeout(() => this.timeOut(slot, job), this.options.timeoutMs);
      slot.worker.postMessage(
        job.kind === 'compile'
          ? { id: job.id, kind: 'compile', document: job.document, options: job.options }
          : { id: job.id, kind: 'import', mjml: job.mjml },
      );
    }
  }

  private timeOut(slot: Slot, job: Job): void {
    if (slot.job !== job) return;
    slot.retired = true;
    slot.job = null;
    slot.timer = null;
    if (job.kind === 'import') {
      job.reject(
        importRefusal({
          code: 'too_complex',
          message: `Reading the MJML did not finish within ${this.options.timeoutMs} ms. Split it into smaller documents and import them one by one.`,
        }),
      );
    } else {
      job.resolve({
        mjml: '',
        html: '',
        warnings: [],
        errors: [
          {
            message: `Compilation did not finish within ${this.options.timeoutMs} ms. Simplify the document (fewer or smaller blocks) and try again.`,
          },
        ],
      });
    }
    void slot.worker.terminate();
    if (this.closed) return;
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots[index] = this.spawn();
  }
}
