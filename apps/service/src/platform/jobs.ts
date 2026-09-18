import type { Compiler } from '../compile/pool.js';
import type { Sql } from '../db.js';
import type { UnsubscribeSigner } from '../unsubscribe.js';
import type { TransportFor } from '../worker/transports.js';
import type { RootKeys } from './tokens.js';
import { createAbDecisionJob } from './ab-job.js';
import { createScheduleJob } from './schedule-job.js';
import type { PlatformJob } from './worker.js';

/** What the S4 jobs are built from; main.ts passes the same objects the API and the send worker use. */
export type PlatformDeps = {
  sql: Sql;
  compiler: Compiler;
  transportFor: TransportFor;
  unsubscribeSigner: UnsubscribeSigner;
  /** MAIL_UNSUBSCRIBE_KEY by version; the S4 token signers derive their keys from it (src/platform/tokens.ts). */
  rootKeys: RootKeys;
  publicBaseUrl: string;
  log?: Pick<Console, 'error' | 'log'>;
};

/** Every job the platform worker runs, in the order of one round. */
export function platformJobs(deps: PlatformDeps): PlatformJob[] {
  const compile = (document: Parameters<Compiler['compile']>[0]) => deps.compiler.compile(document);
  return [
    createScheduleJob({ sql: deps.sql, compile, log: deps.log }),
    createAbDecisionJob({ sql: deps.sql, log: deps.log }),
  ];
}
