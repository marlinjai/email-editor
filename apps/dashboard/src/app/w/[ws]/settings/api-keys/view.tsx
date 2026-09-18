'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ApiKey, ApiKeyScope } from '@marlinjai/mail-contract';
import { ConfirmDialog, SecretOnceDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, EmptyState, Field, Input, Mono, Section, Select, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { createApiKey, revokeApiKey } from '../actions';

const SCOPES: Record<ApiKeyScope, string> = {
  full: 'Full: everything, including settings',
  send: 'Send: templates, contacts, mailings, suppressions',
  read: 'Read: reads only',
};

export function ApiKeysView({ ws, keys }: { ws: string; keys: ApiKey[] }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('send');
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <>
      <Section title="Create a key" description="For your own application's server. A key is shown once, then only its first characters; keep it out of browsers and repositories.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => createApiKey(ws, { name, scope }), (r) => {
              setCreated({ key: r.key, name: r.api_key.name });
              setName('');
              router.refresh();
            });
          }}
        >
          <Field id="key-name" label="Name" hint="What uses it, e.g. Studio production" error={fields.name} className="min-w-[240px] flex-1">
            <Input {...describedBy('key-name', fields.name, true)} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
          <Field id="key-scope" label="Scope" error={fields.scope} className="w-[320px]">
            <Select {...describedBy('key-scope', fields.scope)} value={scope} onChange={(e) => setScope(e.target.value as ApiKeyScope)}>
              {(Object.keys(SCOPES) as ApiKeyScope[]).map((s) => (
                <option key={s} value={s}>
                  {SCOPES[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" busy={pending}>
            Create key
          </Button>
        </form>
        <div className="mt-3">
          <FormError error={error && !error.fields ? error : null} />
        </div>
      </Section>
      <Section title="Active keys">
        {active.length === 0 ? (
          <EmptyState title="No active keys">Create one above when an application needs to call the mail API for this workspace.</EmptyState>
        ) : (
          <Table label="Active API keys">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Scope</Th>
                <Th>Last used</Th>
                <Th>Created</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id}>
                  <Td>{k.name}</Td>
                  <Td>
                    <Mono>{k.prefix}…</Mono>
                  </Td>
                  <Td>
                    <Badge tone={k.scope === 'full' ? 'gold' : 'neutral'}>{k.scope}</Badge>
                  </Td>
                  <Td>
                    <When at={k.last_used_at} />
                  </Td>
                  <Td>
                    <When at={k.created_at} />
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" onClick={() => setRevoking(k)}>
                      Revoke
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
      {revoked.length > 0 ? (
        <Section title="Revoked keys" description="Kept so the audit log can still name them. They no longer authenticate.">
          <Table label="Revoked API keys">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Revoked</Th>
              </tr>
            </thead>
            <tbody>
              {revoked.map((k) => (
                <tr key={k.id} className="text-muted">
                  <Td className="text-muted">{k.name}</Td>
                  <Td>
                    <Mono>{k.prefix}…</Mono>
                  </Td>
                  <Td>
                    <When at={k.revoked_at} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : null}
      <SecretOnceDialog open={created !== null} onClose={() => setCreated(null)} title={`API key "${created?.name ?? ''}"`} secret={created?.key ?? ''} />
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke "${revoking?.name ?? ''}"?`}
        description="Every request made with this key fails from now on. This cannot be undone; create a new key if you need one again."
        confirmLabel="Revoke key"
        confirmText={revoking?.name}
        action={() => revokeApiKey(ws, revoking!.id)}
        onDone={() => router.refresh()}
      />
    </>
  );
}
