# @marlinjai/mail-sdk

The typed client for the Lumitra Mail v1 Application Programming Interface (API).
Every request and response shape comes from `@marlinjai/mail-contract`
(workspace dependency): this package only adds the Hypertext Transfer Protocol
(HTTP) mechanics on top (authentication, retries, idempotency, cursor
pagination). Nothing here redefines a shape the contract already owns.

Runs in Node 20+ (Node 18/19 need `--experimental-global-webcrypto` for
`crypto.randomUUID`, which the SDK uses to mint idempotency keys) and on every
major edge runtime: only `fetch`, `FormData`, `AbortController` and
`globalThis.crypto` are used, no `node:` built-ins.

## Install

```bash
pnpm add @marlinjai/mail-sdk
```

## Quick start: a server-side client in a Next.js app (ŌPUNTIA's Studio)

ŌPUNTIA's admin keeps its own people and pushes recipients per mailing; the mail
service is its mail infrastructure. A workspace application programming
interface (API) key is created once in the mail service's dashboard and stored
as a server-only secret (never shipped to the browser).

```ts
// lib/mail-client.ts (server-only module)
import { createMailClient } from '@marlinjai/mail-sdk';

export const mail = createMailClient({
  baseUrl: process.env.MAIL_SERVICE_URL!, // e.g. https://mail.lumitra.co
  apiKey: process.env.MAIL_API_KEY!, // a workspace key, scope "send" is enough to mail people
});
```

```ts
// app/actions/send-programme-update.ts ("use server")
import { mail } from '@/lib/mail-client';

export async function sendProgrammeUpdate(document: unknown, recipients: { email: string; external_id: string }[]) {
  const mailing = await mail.mailings.create({
    subject: 'This week at ŌPUNTIA',
    topic: 'programme-updates',
    provider_id: process.env.MAIL_PROVIDER_ID!,
    document: document as never, // the editor's TemplateDocument
  });

  await mail.mailings.addRecipients(mailing.id, { recipients });
  await mail.mailings.send(mailing.id);
  return mailing;
}
```

Every mutating call carries its own `Idempotency-Key` automatically, reused
across retries, so calling `sendProgrammeUpdate` again after a network blip
never double-sends: a retried `mailings.send` with the same key returns the
first response instead of starting a second send.

### Paginating a list

```ts
for await (const contact of mail.paginate('contacts.list', { query: { topic: 'programme-updates' } })) {
  console.log(contact.email);
}
```

`paginate` only accepts operations whose response is a cursor page (`{ data,
next_cursor }`); passing `billing.plans` or `contactProperties.list`, which
return a bare `{ data }` array, is a compile error, not a runtime surprise.

### Anything the friendly methods do not cover

Every namespaced method (`mail.mailings.*`, `mail.contacts.*`, and so on) is a
thin wrapper over `mail.request(operationId, { params, query, body })`, which
accepts any operation id from `@marlinjai/mail-contract`'s route table and is
typed from the same source. Reach for it directly for an operation this
package has not wrapped yet, or to pass a raw `AbortSignal`.

```ts
const workspace = await mail.request('workspace.get');
```

## The dashboard variant: server-only, per signed-in person

The mail service's own dashboard (`apps/dashboard`) signs people in through
auth-brain and calls the service with its own service token plus the signed-in
person's auth-brain subject and workspace. **`createDashboardMailClient` must
never run in a browser**: its service token authenticates as the whole
dashboard, not one person, and shipping it to a browser bundle would leak it to
every visitor. The constructor throws immediately if it detects a `window`
global, but the real guarantee has to come from where you call it: only from
server-side code (a Next.js server action, route handler or server component).

```ts
// lib/dashboard-mail-client.ts (server-only module)
import { createDashboardMailClient } from '@marlinjai/mail-sdk';

const dashboardMail = createDashboardMailClient({
  baseUrl: process.env.MAIL_SERVICE_URL!,
  serviceToken: process.env.MAIL_DASHBOARD_SERVICE_TOKEN!,
});

export function mailClientFor(subject: string, workspaceId: string) {
  return dashboardMail.forUser({ subject, workspaceId });
}
```

```ts
// app/dashboard/mailings/actions.ts ("use server")
import { auth } from '@/lib/auth-brain'; // however the app resolves the signed-in person
import { mailClientFor } from '@/lib/dashboard-mail-client';

export async function pauseMailing(mailingId: string) {
  const session = await auth();
  const client = mailClientFor(session.subject, session.workspaceId);
  return client.mailings.pause(mailingId);
}
```

The service checks that `subject`'s membership and role in `workspaceId` on
every call; the SDK never assumes the caller is authorized, it only carries the
headers.

## A webhook receiver

The webhook signature helpers and the `WebhookEvent` union are re-exported from
`@marlinjai/mail-contract`, so a receiver needs only this one package.

```ts
// app/api/mail-webhooks/route.ts
import { WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TIMESTAMP_HEADER, WebhookEvent, verifyWebhook } from '@marlinjai/mail-sdk';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const check = await verifyWebhook({
    secret: process.env.MAIL_WEBHOOK_SECRET!,
    rawBody,
    signatureHeader: req.headers.get(WEBHOOK_SIGNATURE_HEADER),
    timestampHeader: req.headers.get(WEBHOOK_TIMESTAMP_HEADER),
  });
  if (!check.ok) return new Response(check.reason, { status: 401 });

  const event = WebhookEvent.parse(JSON.parse(rawBody));
  // Deliveries may repeat: deduplicate on event.id before acting on it.
  switch (event.type) {
    case 'message.sent':
      // archive event.data.html next to your own record of the send
      break;
    case 'contact.unsubscribed':
      // mirror the unsubscribe into your own system of record
      break;
    // ...
  }
  return new Response(null, { status: 204 });
}
```

## Errors

Every failure is one of four typed classes; a switch on `instanceof` (or on
`MailApiError.code`) is always enough, never on `.message`, which is for
humans:

| Class | When |
| --- | --- |
| `MailApiError` | The service answered a non-2xx response. Carries `code` (`ErrorCode` from the contract), `status`, `message`, `details` and `requestId`. |
| `MailNetworkError` | The request never reached the service (Domain Name System (DNS), Transport Layer Security (TLS), connection reset). |
| `MailTimeoutError` | A single attempt exceeded `timeoutMs`. |
| `MailResponseValidationError` | The service answered 2xx but the body did not match the contract's schema (a service bug or a contract version mismatch). Never retried: retrying an already-succeeded mutating call risks a duplicate. |

```ts
import { MailApiError } from '@marlinjai/mail-sdk';

try {
  await mail.mailings.send(mailingId);
} catch (err) {
  if (err instanceof MailApiError && err.code === 'missing_unsubscribe_url') {
    // the document has no {{unsubscribe_url}}; show the editor error, don't retry
  }
  throw err;
}
```

## Retries

Retries apply only to network failures, request timeouts, and responses whose
error `code` is in the contract's `RETRYABLE_ERRORS` (`rate_limited`,
`provider_error`, `internal_error`, `service_unavailable`). Every other error,
including `daily_budget_exhausted` and `plan_limit_reached` even though both
are HTTP 429, is never retried: retrying them would not help, since the
condition they report does not clear on its own within the request's lifetime.

- Exponential backoff with full jitter, capped at 8 seconds between attempts.
- `Retry-After` (seconds or a Hypertext Transfer Protocol (HTTP) date) is
  honoured when the service sends it, capped at 60 seconds so a large value can
  never hang a caller.
- A fresh `Idempotency-Key` is minted once per call (via `crypto.randomUUID()`)
  and reused across every attempt of that call: this is what makes a retry safe.
  A caller may also pass its own key through the last `opts` argument any
  mutating method takes (`{ idempotencyKey }`).
- `maxRetries` (default 3) and `timeoutMs` (default 10000, per attempt) are
  configurable on `createMailClient`.
- A caller-provided `AbortSignal` (also in the last `opts` argument) is never
  itself retried: an abort you asked for propagates immediately.

## Configuration

```ts
createMailClient({
  baseUrl: string; // the mail service's origin, e.g. "https://mail.lumitra.co"
  apiKey: string; // a workspace API key: `Authorization: Bearer <key>`
  fetch?: typeof fetch; // defaults to the runtime's global fetch
  timeoutMs?: number; // default 10000, per attempt
  maxRetries?: number; // default 3
  userAgent?: string;
  validateResponses?: boolean; // default true; disable only once you trust the deployment
});
```

## Development

```bash
pnpm -F @marlinjai/mail-sdk run build   # tsup, dual CJS/ESM + .d.ts
pnpm -F @marlinjai/mail-sdk run lint    # tsc --noEmit (the linter for this repo)
pnpm -F @marlinjai/mail-sdk run test    # vitest, a mocked fetch, no network
```
