import type { AssetPolicy, CompileMessage, CompileResult } from '@marlinjai/mail-contract';
import { ApiError } from '../api-error.js';
import { validateDocument } from '../documents.js';
import type { Repos } from '../repo/index.js';
import { applyAssetPolicy, remoteAssetErrors } from './asset-policy.js';
import type { Compiler } from './pool.js';

/**
 * Compiling for a workspace: the workspace's `asset_policy` decides how.
 * Under `service_only` MJML's automatic Google Fonts imports are left out and
 * every address outside the service's host becomes a compile error, so the
 * editor's preview, a test send and a send all refuse the same documents.
 * Every compile site goes through this, never through the pool directly, and
 * the document is brought to the current schema version here (the compiler
 * knows only that one), so a stored 1.0 document compiles as it always did.
 */
export type WorkspaceCompile = {
  compile(workspaceId: string, document: unknown): Promise<CompileResult>;
  /** The policy's errors for HTML compiled earlier (a mailing's stored snapshot); empty under `any`. */
  check(workspaceId: string, html: string): Promise<CompileMessage[]>;
};

export function workspaceCompile(pool: Repos, compiler: Compiler, publicBaseUrl: string): WorkspaceCompile {
  const policyOf = async (workspaceId: string): Promise<AssetPolicy> => {
    const workspace = await pool.workspaces.get(workspaceId);
    if (!workspace) throw new ApiError('not_found', 'The workspace no longer exists.');
    return workspace.settings.asset_policy;
  };
  return {
    async compile(workspaceId, document) {
      const current = validateDocument(document);
      const policy = await policyOf(workspaceId);
      const result = await compiler.compile(current, { webFonts: policy !== 'service_only' });
      return applyAssetPolicy(result, policy, publicBaseUrl);
    },
    async check(workspaceId, html) {
      return (await policyOf(workspaceId)) === 'service_only' ? remoteAssetErrors(html, publicBaseUrl) : [];
    },
  };
}
