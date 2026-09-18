'use client';

import { useEffect, useState } from 'react';

/** "Saved" beside a form's button after a success, announced politely, gone after a few seconds. */
export function useSaved() {
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    if (at === null) return;
    const t = setTimeout(() => setAt(null), 4000);
    return () => clearTimeout(t);
  }, [at]);
  return { mark: () => setAt(Date.now()), node: <SavedNote visible={at !== null} /> };
}

function SavedNote({ visible }: { visible: boolean }) {
  return (
    <span aria-live="polite" className="text-[12.5px] text-ok">
      {visible ? 'Saved' : ''}
    </span>
  );
}
