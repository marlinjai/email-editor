'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ContactPropertyDefinition, ContactPropertyType } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, EmptyState, Field, Input, Mono, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { createProperty, deleteProperty } from '../actions';

export const PROPERTY_TYPE_LABELS: Record<ContactPropertyType, string> = {
  string: 'Text',
  number: 'Number',
  boolean: 'Yes or no',
  date: 'Date',
};

/** A key from a label: what a CSV header or an API client would most likely call it. */
function keyFrom(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/** Typed contact properties: once defined, every write of the key must have its type, and segments compare it as that type. */
export function PropertiesView({ ws, properties, canAdmin }: { ws: string; properties: ContactPropertyDefinition[]; canAdmin: boolean }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<ContactPropertyType>('string');
  const [removing, setRemoving] = useState<ContactPropertyDefinition | null>(null);

  return (
    <>
      <PageHeader
        title="Contact properties"
        description="Give a property a type and every value written to it is checked: by your application, by an import, by a signup form. Segments then compare it as a number, a date or a yes or no. Keys without a definition stay free-form."
      />
      {canAdmin ? (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => createProperty(ws, { key, label, type }),
              () => {
                setLabel('');
                setKey('');
                setKeyTouched(false);
                setType('string');
                router.refresh();
              },
            );
          }}
        >
          <Field id="p-label" label="Label" error={fields.label} className="w-56">
            <Input
              {...describedBy('p-label', fields.label)}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!keyTouched) setKey(keyFrom(e.target.value));
              }}
              placeholder="Plan tier"
              required
            />
          </Field>
          <Field id="p-key" label="Key" error={fields.key} className="w-48">
            <Input
              {...describedBy('p-key', fields.key)}
              value={key}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value);
              }}
              className="font-mono"
              spellCheck={false}
              required
            />
          </Field>
          <Field id="p-type" label="Type" error={fields.type} className="w-40">
            <Select {...describedBy('p-type', fields.type)} value={type} onChange={(e) => setType(e.target.value as ContactPropertyType)}>
              {(Object.keys(PROPERTY_TYPE_LABELS) as ContactPropertyType[]).map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" busy={pending}>
            Define property
          </Button>
          <div className="basis-full">
            <FormError error={error && !error.fields ? error : null} />
          </div>
        </form>
      ) : (
        <p className="mb-6 text-[12.5px] text-faint">Only an admin or owner can define properties.</p>
      )}
      {properties.length === 0 ? (
        <EmptyState title="No typed properties yet">Contacts can still carry any property; defining one adds the type check.</EmptyState>
      ) : (
        <Table label="Contact properties">
          <thead>
            <tr>
              <Th>Label</Th>
              <Th>Key</Th>
              <Th>Type</Th>
              {canAdmin ? <Th className="w-0">{''}</Th> : null}
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.key}>
                <Td>{p.label}</Td>
                <Td>
                  <Mono>{p.key}</Mono>
                </Td>
                <Td>
                  <Badge>{PROPERTY_TYPE_LABELS[p.type]}</Badge>
                </Td>
                {canAdmin ? (
                  <Td>
                    <Button variant="ghost" onClick={() => setRemoving(p)} aria-label={`Remove the definition of ${p.key}`}>
                      Remove
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove the definition of ${removing?.key ?? ''}?`}
        description="The values stay on the contacts; the key is free-form again, so nothing checks its type any more and segments compare it as text."
        confirmLabel="Remove definition"
        action={() => deleteProperty(ws, removing!.key)}
        onDone={() => router.refresh()}
      />
    </>
  );
}
