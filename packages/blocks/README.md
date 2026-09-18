# @marlinjai/email-editor-blocks

The standard block library of [`@marlinjai/email-editor`](https://www.npmjs.com/package/@marlinjai/email-editor): 14 block types (text, image, button, divider, spacer, social, hero, accordion, raw HTML, navbar, carousel, table, header, footer) and 35 pre-built sections.

You only need it directly to assemble the editor yourself or to start from the standard registry:

```ts
import { createStandardBlockRegistry, createStandardPrebuiltRegistry } from '@marlinjai/email-editor-blocks';

const blocks = createStandardBlockRegistry();
const sections = createStandardPrebuiltRegistry();
```

`@marlinjai/email-editor` already uses both. Its `blocks` option redefines a standard block type (label, icon, category, default props); new block types are not supported yet, because the document schema, the canvas and the server compiler only know the 14 standard ones.

## License

MIT
