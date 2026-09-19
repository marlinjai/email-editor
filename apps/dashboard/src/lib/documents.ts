/** An empty document in the editor's schema (version 1.1), the starting point of a new template. */
export function blankDocument(title: string) {
  return { version: '1.1' as const, metadata: { title, subject: '', previewText: '' }, sections: [] as Array<Record<string, unknown>> };
}
