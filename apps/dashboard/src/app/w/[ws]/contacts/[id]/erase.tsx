'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import { eraseContact } from '../../audiences-actions';

/** Erasure behind a typed confirmation: it deletes archived mail and cannot be undone. */
export function EraseContact({ ws, contactId, email }: { ws: string; contactId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Erase contact
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Erase ${email}?`}
        description="For a request to be forgotten: the contact, its place in every mailing and the archived copy of every message sent to it are deleted for good. Its suppressions stay, so it is never mailed again by mistake. This cannot be undone."
        confirmLabel="Erase for good"
        confirmText={email}
        action={() => eraseContact(ws, contactId)}
        onDone={() => router.push(`/w/${ws}/contacts`)}
      />
    </>
  );
}
