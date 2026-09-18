'use client';

import { useRouter } from 'next/navigation';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { acceptInvite } from './actions';

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col gap-4">
      <FormError error={error} />
      <Button
        variant="primary"
        busy={pending}
        className="self-start"
        onClick={() =>
          void run(
            () => acceptInvite(token),
            (r) => router.push(`/w/${r.workspaceId}`),
          )
        }
      >
        Accept invitation
      </Button>
    </div>
  );
}
