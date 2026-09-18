# @marlinjai/email-editor-ui

The React interface of [`@marlinjai/email-editor`](https://www.npmjs.com/package/@marlinjai/email-editor): toolbar, block sidebar, canvas and property inspector, plus the prebuilt stylesheet (`@marlinjai/email-editor-ui/styles.css`).

Most apps should use `@marlinjai/email-editor` instead, which wires this UI to the standard blocks and pre-built sections. Use this package directly only to supply your own block registry:

```tsx
import { EmailEditor } from '@marlinjai/email-editor-ui';
import '@marlinjai/email-editor-ui/styles.css';

<EmailEditor blockRegistry={myRegistry} onChange={save} onRequestImage={pickImage} />;
```

The stylesheet is scoped under `.ee-root` (the element `EmailEditor` renders) and is safe next to Tailwind CSS 4. Theming, the `onRequestImage` contract and the Next.js setup are documented in the [editor README](https://github.com/marlinjai/email-editor/tree/main/packages/editor#readme).

Requires `react` and `react-dom` 18 or 19.

## License

MIT
