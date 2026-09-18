'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button, describedBy, Field, Input, Select } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { slugify } from '@/lib/format';
import { createWorkspace } from '../actions';

export function CreateWorkspaceForm({ companies, defaultCompanyId }: { companies: Array<{ id: string; name: string }>; defaultCompanyId: string | null }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? companies[0]?.id ?? '');

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => createWorkspace({ name, slug, companyId }), (ws) => router.push(`/w/${ws.id}`));
      }}
    >
      <Field id="ws-name" label="Name" error={fields.name}>
        <Input
          {...describedBy('ws-name', fields.name)}
          value={name}
          required
          maxLength={120}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="ŌPUNTIA Gatherings"
        />
      </Field>
      <Field id="ws-slug" label="Slug" hint="Lowercase letters, digits and single hyphens. Unique across Lumitra Mail." error={fields.slug}>
        <Input
          {...describedBy('ws-slug', fields.slug, true)}
          value={slug}
          required
          maxLength={64}
          spellCheck={false}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className="font-mono"
        />
      </Field>
      {companies.length > 1 ? (
        <Field id="ws-company" label="Company" hint="Deleting this company in your Lumitra account deletes the workspace too." error={fields.companyId}>
          <Select {...describedBy('ws-company', fields.companyId, true)} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : companies.length === 1 ? (
        <p className="text-[13px] text-muted">
          For <span className="text-ink">{companies[0]!.name}</span>. Deleting this company in your Lumitra account deletes the workspace too.
        </p>
      ) : (
        <p className="text-[13px] text-danger">None of your companies has Lumitra Mail enabled, so no workspace can be created.</p>
      )}
      <FormError error={error} />
      <Button type="submit" variant="primary" busy={pending} disabled={companies.length === 0} className="self-start">
        Create workspace
      </Button>
    </form>
  );
}
