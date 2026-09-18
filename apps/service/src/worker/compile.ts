import type { CompileResult } from '@marlinjai/mail-contract';

/**
 * Compiles a mailing's document into MJML and HTML with the editor core's
 * compiler, the same one S1's compile API uses.
 *
 * This is the in-process adapter of the sending phase. S1 (branch
 * feat/s1-templates) brings `CompilePool` in src/compile/pool.ts, which runs the
 * same compiler in worker threads behind the same `Compiler` interface; once both
 * are on main, the app passes the pool here and this file goes.
 *
 * The document is validated with the core's own schema (`migrateTemplate`)
 * before compiling, since the contract's `TemplateDocument` checks only the
 * envelope. A document that fails validation is answered like one that fails to
 * compile: a result whose `errors` say why, never a thrown error.
 */
export interface Compiler {
  compile(document: unknown): Promise<CompileResult>;
}

type CoreServer = typeof import('@marlinjai/email-editor-core/server');
type Core = typeof import('@marlinjai/email-editor-core');

export function createInProcessCompiler(): Compiler {
  // Loaded on first use: mjml is heavy, and a process that never compiles
  // (the migrate command) should not pay for it.
  let loaded: Promise<{ core: Core; server: CoreServer }> | null = null;
  const load = () =>
    (loaded ??= Promise.all([import('@marlinjai/email-editor-core'), import('@marlinjai/email-editor-core/server')]).then(
      ([core, server]) => ({ core, server }),
    ));

  return {
    async compile(document) {
      const { core, server } = await load();
      let template;
      try {
        template = core.migrateTemplate(document);
      } catch (err) {
        return { mjml: '', html: '', warnings: [], errors: [{ message: errorText(err) }] };
      }
      const result = server.createMJMLCompiler().compile(template);
      return {
        mjml: result.mjml,
        html: result.html,
        warnings: [],
        errors: (result.errors ?? []).map((message) => ({ message: stripPaths(message) })),
      };
    },
  };
}

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'The document is not a valid template.';
}

/** MJML names the server's file path in its messages; a client never sees it. */
function stripPaths(message: string): string {
  return message.replace(/ of \S+ \(/, ' (').trim() || 'Unknown compilation error.';
}
