import type { ImportJobCreate, RouteBody, RouteParams, RouteQuery } from '@marlinjai/mail-contract';
import { execute, executeMultipart, type CoreConfig, type RequestOpts } from './core';

/**
 * Namespaced, hand-written wrappers over `execute`/`executeMultipart`. Every
 * method names its operation id as a literal, so its parameter and return types
 * are inferred straight from `@marlinjai/mail-contract`'s `RouteBody`/`RouteQuery`/
 * `RouteResponse`: nothing here redefines a shape the contract already owns.
 *
 * `opts` (an `Idempotency-Key` override, an `AbortSignal`) is the last, optional
 * argument of every mutating method.
 */
export function createNamespaces(config: CoreConfig) {
  return {
    /**
     * `workspaces` (plural) is the dashboard-only pair for a person with no
     * workspace context yet: creating one, and listing the ones they belong to.
     * `workspace` (singular, below) is the ordinary per-workspace read/update,
     * reachable with a workspace API key or a dashboard call already bound to one.
     */
    workspaces: {
      create: (body: RouteBody<'workspaces.create'>, opts?: RequestOpts) => execute(config, 'workspaces.create', { body }, opts),
      list: (query?: RouteQuery<'workspaces.list'>, opts?: RequestOpts) => execute(config, 'workspaces.list', { query }, opts),
    },

    workspace: {
      get: (opts?: RequestOpts) => execute(config, 'workspace.get', {}, opts),
      update: (body: RouteBody<'workspace.update'>, opts?: RequestOpts) => execute(config, 'workspace.update', { body }, opts),
    },

    members: {
      list: (query?: RouteQuery<'members.list'>, opts?: RequestOpts) => execute(config, 'members.list', { query }, opts),
      /**
       * The service binds people by auth-brain subject only (it never sees a
       * login), so the caller resolves the person first and sends the subject
       * with their email and name.
       */
      add: (body: RouteBody<'members.add'>, opts?: RequestOpts) => execute(config, 'members.add', { body }, opts),
      update: (id: string, body: RouteBody<'members.update'>, opts?: RequestOpts) =>
        execute(config, 'members.update', { params: { id }, body }, opts),
      remove: (id: string, opts?: RequestOpts) => execute(config, 'members.remove', { params: { id } }, opts),
    },

    apiKeys: {
      list: (query?: RouteQuery<'apiKeys.list'>, opts?: RequestOpts) => execute(config, 'apiKeys.list', { query }, opts),
      create: (body: RouteBody<'apiKeys.create'>, opts?: RequestOpts) => execute(config, 'apiKeys.create', { body }, opts),
      revoke: (id: string, opts?: RequestOpts) => execute(config, 'apiKeys.revoke', { params: { id } }, opts),
    },

    auditLog: {
      list: (query?: RouteQuery<'audit.list'>, opts?: RequestOpts) => execute(config, 'audit.list', { query }, opts),
    },

    templates: {
      list: (query?: RouteQuery<'templates.list'>, opts?: RequestOpts) => execute(config, 'templates.list', { query }, opts),
      create: (body: RouteBody<'templates.create'>, opts?: RequestOpts) => execute(config, 'templates.create', { body }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'templates.get', { params: { id } }, opts),
      update: (id: string, body: RouteBody<'templates.update'>, opts?: RequestOpts) =>
        execute(config, 'templates.update', { params: { id }, body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'templates.delete', { params: { id } }, opts),
      versions: (id: string, query?: RouteQuery<'templates.versions'>, opts?: RequestOpts) =>
        execute(config, 'templates.versions', { params: { id }, query }, opts),
      version: (id: string, version: number, opts?: RequestOpts) =>
        execute(config, 'templates.version', { params: { id, version } as RouteParams<'templates.version'> }, opts),
      compile: (id: string, body: RouteBody<'templates.compile'> = {}, opts?: RequestOpts) =>
        execute(config, 'templates.compile', { params: { id }, body }, opts),
    },

    /** Compiles an unsaved document (the editor's live preview), not a saved template. */
    compile: (body: RouteBody<'compile'>, opts?: RequestOpts) => execute(config, 'compile', { body }, opts),

    assets: {
      /** `file` must be a `Blob` (edge-safe): wrap a Node `Buffer` with `new Blob([buffer])`. */
      upload: (file: Blob, filename?: string, opts?: RequestOpts) =>
        executeMultipart(config, 'assets.upload', { file, filename }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'assets.get', { params: { id } }, opts),
    },

    providers: {
      list: (query?: RouteQuery<'providers.list'>, opts?: RequestOpts) => execute(config, 'providers.list', { query }, opts),
      create: (body: RouteBody<'providers.create'>, opts?: RequestOpts) => execute(config, 'providers.create', { body }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'providers.get', { params: { id } }, opts),
      update: (id: string, body: RouteBody<'providers.update'>, opts?: RequestOpts) =>
        execute(config, 'providers.update', { params: { id }, body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'providers.delete', { params: { id } }, opts),
      verify: (id: string, opts?: RequestOpts) => execute(config, 'providers.verify', { params: { id } }, opts),
      usage: (id: string, opts?: RequestOpts) => execute(config, 'providers.usage', { params: { id } }, opts),
    },

    topics: {
      list: (query?: RouteQuery<'topics.list'>, opts?: RequestOpts) => execute(config, 'topics.list', { query }, opts),
      create: (body: RouteBody<'topics.create'>, opts?: RequestOpts) => execute(config, 'topics.create', { body }, opts),
      update: (id: string, body: RouteBody<'topics.update'>, opts?: RequestOpts) =>
        execute(config, 'topics.update', { params: { id }, body }, opts),
    },

    contacts: {
      upsert: (body: RouteBody<'contacts.upsert'>, opts?: RequestOpts) => execute(config, 'contacts.upsert', { body }, opts),
      list: (query?: RouteQuery<'contacts.list'>, opts?: RequestOpts) => execute(config, 'contacts.list', { query }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'contacts.get', { params: { id } }, opts),
      erase: (id: string, opts?: RequestOpts) => execute(config, 'contacts.erase', { params: { id } }, opts),
      messages: (id: string, query?: RouteQuery<'contacts.messages'>, opts?: RequestOpts) =>
        execute(config, 'contacts.messages', { params: { id }, query }, opts),
    },

    suppressions: {
      list: (query?: RouteQuery<'suppressions.list'>, opts?: RequestOpts) => execute(config, 'suppressions.list', { query }, opts),
      create: (body: RouteBody<'suppressions.create'>, opts?: RequestOpts) => execute(config, 'suppressions.create', { body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'suppressions.delete', { params: { id } }, opts),
    },

    mailings: {
      list: (query?: RouteQuery<'mailings.list'>, opts?: RequestOpts) => execute(config, 'mailings.list', { query }, opts),
      create: (body: RouteBody<'mailings.create'>, opts?: RequestOpts) => execute(config, 'mailings.create', { body }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'mailings.get', { params: { id } }, opts),
      update: (id: string, body: RouteBody<'mailings.update'>, opts?: RequestOpts) =>
        execute(config, 'mailings.update', { params: { id }, body }, opts),
      addRecipients: (id: string, body: RouteBody<'mailings.addRecipients'>, opts?: RequestOpts) =>
        execute(config, 'mailings.addRecipients', { params: { id }, body }, opts),
      listRecipients: (id: string, query?: RouteQuery<'mailings.listRecipients'>, opts?: RequestOpts) =>
        execute(config, 'mailings.listRecipients', { params: { id }, query }, opts),
      test: (id: string, body: RouteBody<'mailings.test'>, opts?: RequestOpts) =>
        execute(config, 'mailings.test', { params: { id }, body }, opts),
      send: (id: string, opts?: RequestOpts) => execute(config, 'mailings.send', { params: { id }, body: {} }, opts),
      pause: (id: string, opts?: RequestOpts) => execute(config, 'mailings.pause', { params: { id }, body: {} }, opts),
      resume: (id: string, opts?: RequestOpts) => execute(config, 'mailings.resume', { params: { id }, body: {} }, opts),
      cancel: (id: string, opts?: RequestOpts) => execute(config, 'mailings.cancel', { params: { id }, body: {} }, opts),
      retryFailed: (id: string, body: RouteBody<'mailings.retryFailed'> = {}, opts?: RequestOpts) =>
        execute(config, 'mailings.retryFailed', { params: { id }, body }, opts),
      // S4: scheduling, segments and A/B testing
      addSegment: (id: string, body: RouteBody<'mailings.addSegment'>, opts?: RequestOpts) =>
        execute(config, 'mailings.addSegment', { params: { id }, body }, opts),
      schedule: (id: string, body: RouteBody<'mailings.schedule'>, opts?: RequestOpts) =>
        execute(config, 'mailings.schedule', { params: { id }, body }, opts),
      setAbTest: (id: string, body: RouteBody<'mailings.setAbTest'>, opts?: RequestOpts) =>
        execute(config, 'mailings.setAbTest', { params: { id }, body }, opts),
      analytics: (id: string, opts?: RequestOpts) => execute(config, 'mailings.analytics', { params: { id } }, opts),
    },

    messages: {
      list: (query?: RouteQuery<'messages.list'>, opts?: RequestOpts) => execute(config, 'messages.list', { query }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'messages.get', { params: { id } }, opts),
    },

    webhooks: {
      list: (query?: RouteQuery<'webhooks.list'>, opts?: RequestOpts) => execute(config, 'webhooks.list', { query }, opts),
      create: (body: RouteBody<'webhooks.create'>, opts?: RequestOpts) => execute(config, 'webhooks.create', { body }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'webhooks.get', { params: { id } }, opts),
      update: (id: string, body: RouteBody<'webhooks.update'>, opts?: RequestOpts) =>
        execute(config, 'webhooks.update', { params: { id }, body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'webhooks.delete', { params: { id } }, opts),
      rotateSecret: (id: string, opts?: RequestOpts) => execute(config, 'webhooks.rotateSecret', { params: { id } }, opts),
      deliveries: (id: string, query?: RouteQuery<'webhooks.deliveries'>, opts?: RequestOpts) =>
        execute(config, 'webhooks.deliveries', { params: { id }, query }, opts),
      redeliver: (id: string, deliveryId: string, opts?: RequestOpts) =>
        execute(config, 'webhooks.redeliver', { params: { id, delivery_id: deliveryId } as RouteParams<'webhooks.redeliver'> }, opts),
    },

    // S4: the platform features. Typed against the contract; the service answers
    // `not_found` until S4 ships.
    tags: {
      list: (query?: RouteQuery<'tags.list'>, opts?: RequestOpts) => execute(config, 'tags.list', { query }, opts),
      create: (body: RouteBody<'tags.create'>, opts?: RequestOpts) => execute(config, 'tags.create', { body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'tags.delete', { params: { id } }, opts),
      assign: (id: string, body: RouteBody<'tags.assign'>, opts?: RequestOpts) => execute(config, 'tags.assign', { params: { id }, body }, opts),
      unassign: (id: string, body: RouteBody<'tags.unassign'>, opts?: RequestOpts) =>
        execute(config, 'tags.unassign', { params: { id }, body }, opts),
    },

    segments: {
      list: (query?: RouteQuery<'segments.list'>, opts?: RequestOpts) => execute(config, 'segments.list', { query }, opts),
      create: (body: RouteBody<'segments.create'>, opts?: RequestOpts) => execute(config, 'segments.create', { body }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'segments.get', { params: { id } }, opts),
      update: (id: string, body: RouteBody<'segments.update'>, opts?: RequestOpts) =>
        execute(config, 'segments.update', { params: { id }, body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'segments.delete', { params: { id } }, opts),
    },

    signupForms: {
      list: (query?: RouteQuery<'signupForms.list'>, opts?: RequestOpts) => execute(config, 'signupForms.list', { query }, opts),
      create: (body: RouteBody<'signupForms.create'>, opts?: RequestOpts) => execute(config, 'signupForms.create', { body }, opts),
      update: (id: string, body: RouteBody<'signupForms.update'>, opts?: RequestOpts) =>
        execute(config, 'signupForms.update', { params: { id }, body }, opts),
      delete: (id: string, opts?: RequestOpts) => execute(config, 'signupForms.delete', { params: { id } }, opts),
      /** The public submission route: usable without a workspace key in a browser form handler. */
      submit: (id: string, body: RouteBody<'signupForms.submit'>, opts?: RequestOpts) =>
        execute(config, 'signupForms.submit', { params: { id }, body }, opts),
    },

    imports: {
      create: (file: Blob, options: ImportJobCreate, opts?: RequestOpts) =>
        executeMultipart(config, 'imports.create', { file, json: options }, opts),
      list: (query?: RouteQuery<'imports.list'>, opts?: RequestOpts) => execute(config, 'imports.list', { query }, opts),
      get: (id: string, opts?: RequestOpts) => execute(config, 'imports.get', { params: { id } }, opts),
    },

    tracking: {
      update: (body: RouteBody<'tracking.update'>, opts?: RequestOpts) => execute(config, 'tracking.update', { body }, opts),
    },

    contactProperties: {
      list: (opts?: RequestOpts) => execute(config, 'contactProperties.list', {}, opts),
      create: (body: RouteBody<'contactProperties.create'>, opts?: RequestOpts) =>
        execute(config, 'contactProperties.create', { body }, opts),
    },

    // S5: billing. Typed against the contract; the service answers `not_found` until S5 ships.
    billing: {
      plans: (opts?: RequestOpts) => execute(config, 'billing.plans', {}, opts),
      subscription: (opts?: RequestOpts) => execute(config, 'billing.subscription', {}, opts),
      usage: (opts?: RequestOpts) => execute(config, 'billing.usage', {}, opts),
      checkout: (body: RouteBody<'billing.checkout'>, opts?: RequestOpts) => execute(config, 'billing.checkout', { body }, opts),
    },
  };
}

export type MailNamespaces = ReturnType<typeof createNamespaces>;
