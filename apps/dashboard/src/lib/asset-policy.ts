import type { CompileMessage } from '@marlinjai/mail-contract';

/**
 * The remote addresses a compile refused under the workspace's `service_only`
 * asset policy, in the order reported, each once. The service phrases each as
 * `<where>: "<address>" loads from <host>. ...` (apps/service/src/compile/asset-policy.ts);
 * only http and https addresses can be imported, so anything else is left out.
 */
export function offServiceAddresses(errors: CompileMessage[]): string[] {
  const out: string[] = [];
  for (const e of errors) {
    const m = /"(https?:\/\/[^"]+)" loads from /.exec(e.message);
    if (m && !m[1]!.endsWith('...') && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}
