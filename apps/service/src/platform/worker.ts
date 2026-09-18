/**
 * The S4 background work: one loop per process that runs a fixed set of jobs
 * (releasing scheduled mailings, deciding A/B tests, running CSV import batches,
 * sending signup confirmations). Every job keeps its state in Postgres and
 * does its unit of work in a transaction with a row lock (`FOR UPDATE SKIP
 * LOCKED`), so any number of processes can run the loop, and a process that
 * dies mid-job leaves nothing half-applied: the next tick, here or elsewhere,
 * picks the work up where the last committed transaction left it.
 */

export type PlatformJob = {
  /** For logs. */
  name: string;
  /**
   * Does one unit of work, or nothing. Returns true when it did something, so
   * the loop runs again at once instead of waiting a poll interval. `now` is the
   * loop's clock, injectable so tests drive time instead of sleeping.
   */
  tick(now: Date): Promise<boolean>;
};

export type PlatformWorkerOptions = {
  jobs: readonly PlatformJob[];
  /** Idle wait between rounds when no job had work. */
  pollMs?: number;
  now?: () => Date;
  log?: Pick<Console, 'error' | 'log'>;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });

export class PlatformWorker {
  private readonly jobs: readonly PlatformJob[];
  private readonly pollMs: number;
  private readonly now: () => Date;
  private readonly log: Pick<Console, 'error' | 'log'>;
  private stopping = false;
  private wake = new AbortController();
  private running: Promise<void> | null = null;

  constructor(options: PlatformWorkerOptions) {
    this.jobs = options.jobs;
    this.pollMs = options.pollMs ?? 1_000;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? console;
  }

  start(): void {
    if (this.running) return;
    this.stopping = false;
    this.running = this.loop().catch((err) => this.log.error('[platform] loop stopped by an unexpected error:', err));
  }

  /** Lets the unit of work in flight commit, starts no other, and resolves once the loop has exited. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.wake.abort();
    await this.running;
    this.running = null;
  }

  /**
   * One round: every job ticks once. A job that throws is logged and the others
   * still run, so one broken import cannot hold back a scheduled mailing.
   */
  async runOnce(): Promise<boolean> {
    let worked = false;
    for (const job of this.jobs) {
      if (this.stopping) break;
      try {
        if (await job.tick(this.now())) worked = true;
      } catch (err) {
        this.log.error(`[platform] ${job.name} failed:`, err);
      }
    }
    return worked;
  }

  /** Runs rounds until no job has work left. For tests and one-shot drains. */
  async drain(maxRounds = 10_000): Promise<void> {
    for (let i = 0; i < maxRounds; i++) if (!(await this.runOnce())) return;
    throw new Error(`platform jobs still had work after ${maxRounds} rounds`);
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      const worked = await this.runOnce();
      if (!worked) await sleep(this.pollMs, this.wake.signal);
      if (this.wake.signal.aborted && !this.stopping) this.wake = new AbortController();
    }
  }
}
