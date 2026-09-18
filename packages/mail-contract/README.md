# @marlinjai/mail-contract

The version 1 Application Programming Interface (API) contract of the Lumitra Mail service: [zod](https://zod.dev) schemas and TypeScript types for every request, response, error and webhook, the route table, and the webhook signing helpers.

The service, [`@marlinjai/mail-sdk`](https://www.npmjs.com/package/@marlinjai/mail-sdk) and the dashboard all import these definitions instead of keeping their own copies, so a shape is defined exactly once. Its only runtime dependency is zod, and it uses no Node.js built-ins, so it runs in Node.js, browsers and edge runtimes.

```bash
pnpm add @marlinjai/mail-contract zod
```

Most applications use `@marlinjai/mail-sdk`, which builds on this package. Import the contract directly to validate data at your own boundary, or to verify webhooks without the SDK:

- request and response schemas and their types, per resource (workspaces, templates, providers, contacts, mailings, webhooks, unsubscribe)
- the error codes and error body (`ErrorCodeSchema`, `errorBody`, `statusForError`)
- the route table (`matchRoute`, `buildPath`, `acceptsIdempotencyKey`)
- webhook signing and verification (`signWebhook`, `verifyWebhook`): the signature is `v1=<hex>` over `${timestamp}.${rawBody}`, checked in constant time, with a 300 second tolerance

## License

MIT
