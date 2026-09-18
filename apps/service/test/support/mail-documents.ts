/** Mailing documents for the sending tests, in the editor's schema version 1.0. */

type Block = Record<string, unknown>;

export function documentWith(blocks: Block[]) {
  return {
    version: '1.0' as const,
    metadata: { title: 'Mailing' },
    sections: [{ id: 'sec-1', type: 'section', columns: [{ id: 'col-1', blocks }] }],
  };
}

export const textBlock = (content: string, id = 'txt-1'): Block => ({ id, type: 'text', content });

/** A broadcast that can be sent: a greeting with a fallback and the unsubscribe link. */
export const newsletter = (headline = 'Spring news') =>
  documentWith([
    textBlock(`<p>Hello {{first_name|there}}, ${headline} from {{city|our studio}}.</p>`),
    textBlock('<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>', 'txt-2'),
  ]);

/** Compiles, but has no {{unsubscribe_url}}: refused as a broadcast. */
export const withoutUnsubscribe = () => documentWith([textBlock('<p>Hello {{first_name}}</p>')]);

/** Passes the contract's envelope, fails the editor core's schema. */
export const invalidForCore = () => ({ version: '1.0' as const, metadata: {}, sections: [{ id: 's', type: 'nope' }] });

/** Valid for the schema, but MJML rejects the spacer's height: compiles with errors. */
export const brokenSpacer = () =>
  documentWith([
    { id: 'sp-1', type: 'spacer', height: 'abc' },
    textBlock('<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>', 'txt-2'),
  ]);
