/**
 * The slice of jsdom the unsubscribe page tests use, typed without the DOM
 * library. `@types/jsdom` pulls `lib.dom` into the whole project, whose `Blob`
 * and `BlobPart` then reject Node's `Buffer` in the service's own upload code;
 * this service is Node-only (`lib: ["ES2022"]`), so the tests carry this small
 * declaration instead.
 */
declare module 'jsdom' {
  export interface DomElement {
    readonly textContent: string | null;
    readonly value: string;
    readonly name: string;
    getAttribute(name: string): string | null;
    querySelector(selectors: string): DomElement | null;
    querySelectorAll(selectors: string): DomElement[] & { length: number };
    closest(selectors: string): DomElement | null;
  }

  export interface DomDocument extends DomElement {
    readonly title: string;
    readonly documentElement: DomElement & { readonly lang: string };
  }

  export class JSDOM {
    constructor(html?: string, options?: { pretendToBeVisual?: boolean });
    readonly window: { readonly document: DomDocument; close(): void };
  }
}
