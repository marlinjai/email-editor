# @marlinjai/email-editor-core

The framework-agnostic engine of [`@marlinjai/email-editor`](https://www.npmjs.com/package/@marlinjai/email-editor): the email document schema and its validation, `migrateTemplate` for stored documents, the block registry, the MobX State Tree store, and the MJML compiler.

Most apps install it for two things on their server: validating stored documents and compiling them to HTML.

```ts
import { migrateTemplate, isTemplateMigrationError } from '@marlinjai/email-editor-core';
import { createMJMLCompiler } from '@marlinjai/email-editor-core/server';

const doc = migrateTemplate(storedJson); // throws TemplateMigrationError with a typed `code`
const { html, mjml, errors } = createMJMLCompiler().compile(doc);
```

## Two entry points

| Import | Where | Contains |
|--------|-------|----------|
| `@marlinjai/email-editor-core` | browser and server | schema, types, `validateTemplate`, `migrateTemplate`, registry, store |
| `@marlinjai/email-editor-core/server` | server only | MJML compiler and exporter (depends on `mjml`, a Node.js-only package) |

Never import `/server` from client code. In Next.js, list `mjml`, `mjml-core`, `mjml-parser-xml` and `mjml-validator` in `serverExternalPackages`.

## `migrateTemplate(doc)`

Returns the document at the current schema version (`CURRENT_TEMPLATE_VERSION`, today `"1.0"`). For a `1.0` document it is the identity: the same object, validated. Otherwise it throws a `TemplateMigrationError` whose `code` is `INVALID_INPUT`, `MISSING_VERSION`, `UNSUPPORTED_VERSION`, `NEWER_VERSION` (written by a newer editor) or `INVALID_DOCUMENT` (with the schema `issues`). See the [editor README](https://github.com/marlinjai/email-editor/tree/main/packages/editor#readme) for how to use it in an API route.

## License

MIT
