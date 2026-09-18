'use client';

import { Button, ErrorPanel } from '@/components/ui';

/** The last line: anything a page threw that it did not turn into its own error state. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-24">
      <ErrorPanel
        title="Something went wrong"
        message="This page failed to load. Try again; if it keeps failing, quote the reference below."
        requestId={error.digest ?? null}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
