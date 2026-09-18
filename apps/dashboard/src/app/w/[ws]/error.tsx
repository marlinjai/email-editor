'use client';

import { Button, ErrorPanel } from '@/components/ui';

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorPanel
      title="This page failed to load"
      message="Try again; if it keeps failing, quote the reference below."
      requestId={error.digest ?? null}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
