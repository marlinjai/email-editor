'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import type { ContactPropertyDefinition, FilterOperator, Segment, SegmentPreview, Tag, Topic } from '@marlinjai/mail-contract';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Button, describedBy, Field, Input, Notice, Panel, Select, Spinner } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatCount } from '@/lib/format';
import {
  canNest,
  FIELD_LABELS,
  newCondition,
  newGroup,
  operatorLabel,
  operatorsFor,
  propertyType,
  rootFrom,
  takesList,
  takesValue,
  toFilter,
  updateNode,
  type ConditionNode,
  type FilterNode,
  type GroupNode,
} from '@/lib/segments';
import { deleteSegment, previewSegment, saveSegment } from './actions';

type Lookups = { properties: ContactPropertyDefinition[]; tags: Tag[]; topics: Topic[]; trackingOn: boolean };

const GROUP_MODES = [
  { value: 'and', negate: false, label: 'all of' },
  { value: 'or', negate: false, label: 'any of' },
  { value: 'or', negate: true, label: 'none of' },
  { value: 'and', negate: true, label: 'not all of' },
] as const;

const CUSTOM = '__custom';

function ConditionRow({
  node,
  lookups,
  problem,
  disabled,
  onChange,
  onRemove,
}: {
  node: ConditionNode;
  lookups: Lookups;
  problem?: string;
  disabled: boolean;
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const defined = lookups.properties.map((p) => `property:${p.key}`);
  const isCustom = node.field.startsWith('property:') && !defined.includes(node.field);
  const type = propertyType(node.field, lookups.properties);
  const ops = operatorsFor(node.field);
  const setField = (field: string) => {
    const nextOps = operatorsFor(field);
    onChange({ ...node, field, op: nextOps.includes(node.op) ? node.op : nextOps[0]!, value: '' });
  };
  const list = takesList(node.op);
  const listHint = list ? 'Separate values with commas' : undefined;

  let valueInput: React.ReactNode = null;
  if (takesValue(node.op)) {
    const common = {
      'aria-label': 'Value',
      'aria-invalid': problem ? true : undefined,
      'aria-describedby': problem ? `${id}-problem` : undefined,
      value: node.value,
      disabled, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...node, value: e.target.value }) };
    if ((node.field === 'tag' || node.field === 'topic') && !list) {
      const options = node.field === 'tag' ? lookups.tags.map((t) => ({ slug: t.slug, name: t.name })) : lookups.topics.map((t) => ({ slug: t.slug, name: t.name }));
      valueInput = (
        <Select {...common} className="min-w-[180px] flex-1">
          <option value="">Choose a {node.field}</option>
          {options.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.name}
            </option>
          ))}
          {node.value && !options.some((o) => o.slug === node.value) ? <option value={node.value}>{node.value} (no longer exists)</option> : null}
        </Select>
      );
    } else if (type === 'boolean' && !list) {
      valueInput = (
        <Select {...common} className="w-32">
          <option value="">Choose</option>
          <option value="true">yes</option>
          <option value="false">no</option>
        </Select>
      );
    } else {
      const dated = (node.field === 'created_at' || type === 'date') && !list;
      const numeric = (node.field.startsWith('engagement:') || type === 'number') && !list;
      valueInput = (
        <Input
          {...common}
          type={dated ? 'date' : numeric ? 'number' : 'text'}
          min={node.field.startsWith('engagement:') ? 1 : undefined}
          step={node.field.startsWith('engagement:') ? 1 : 'any'}
          placeholder={list ? (node.field === 'tag' || node.field === 'topic' ? 'slug-one, slug-two' : 'one, two') : ''}
          title={listHint}
          className="min-w-[160px] flex-1"
        />
      );
    }
  }

  return (
    <li className="flex flex-col gap-1" data-testid="segment-condition">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={node.negate}
            disabled={disabled}
            onChange={(e) => onChange({ ...node, negate: e.target.checked })}
            className="size-3.5 accent-[var(--gold)]"
          />
          not
        </label>
        <Select
          aria-label="Field"
          value={isCustom ? CUSTOM : node.field}
          disabled={disabled}
          onChange={(e) => setField(e.target.value === CUSTOM ? 'property:' : e.target.value)}
          className="w-44"
        >
          <optgroup label="Contact">
            {['email', 'first_name', 'last_name', 'locale', 'created_at'].map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Audience">
            <option value="tag">{FIELD_LABELS.tag}</option>
            <option value="topic">{FIELD_LABELS.topic}</option>
          </optgroup>
          {lookups.trackingOn || node.field.startsWith('engagement:') ? (
            <optgroup label="Engagement">
              <option value="engagement:opened">{FIELD_LABELS['engagement:opened']}</option>
              <option value="engagement:clicked">{FIELD_LABELS['engagement:clicked']}</option>
            </optgroup>
          ) : null}
          <optgroup label="Properties">
            {lookups.properties.map((p) => (
              <option key={p.key} value={`property:${p.key}`}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM}>Another property…</option>
          </optgroup>
        </Select>
        {isCustom ? (
          <Input
            aria-label="Property key"
            value={node.field.slice('property:'.length)}
            disabled={disabled}
            onChange={(e) => onChange({ ...node, field: `property:${e.target.value}` })}
            placeholder="key"
            className="w-32 font-mono"
            spellCheck={false}
          />
        ) : null}
        <Select aria-label="Comparison" value={node.op} disabled={disabled} onChange={(e) => onChange({ ...node, op: e.target.value as FilterOperator })} className="w-52">
          {ops.map((op) => (
            <option key={op} value={op}>
              {operatorLabel(node.field, op, type)}
            </option>
          ))}
        </Select>
        {valueInput}
        {!disabled ? (
          <Button variant="ghost" onClick={onRemove} aria-label="Remove this condition" className="px-2">
            Remove
          </Button>
        ) : null}
      </div>
      {problem ? (
        <p id={`${id}-problem`} className="text-[12px] text-danger">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

function GroupEditor({
  node,
  depth,
  lookups,
  problems,
  disabled,
  onUpdate,
  onRemove,
}: {
  node: GroupNode;
  depth: number;
  lookups: Lookups;
  problems: Record<string, string>;
  disabled: boolean;
  onUpdate: (id: string, fn: (n: FilterNode) => FilterNode | null) => void;
  onRemove?: () => void;
}) {
  const modeIndex = GROUP_MODES.findIndex((m) => m.value === node.mode && m.negate === node.negate);
  return (
    <div className={depth > 1 ? 'rounded-lg border border-line bg-white/[0.02] p-3' : ''}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span>{depth > 1 ? 'A group matching' : 'Contacts matching'}</span>
        <Select
          aria-label={depth > 1 ? 'How this group combines its conditions' : 'How the conditions combine'}
          value={String(modeIndex)}
          disabled={disabled}
          onChange={(e) => {
            const m = GROUP_MODES[Number(e.target.value)]!;
            onUpdate(node.id, (n) => ({ ...(n as GroupNode), mode: m.value, negate: m.negate }));
          }}
          className="h-8 w-36"
        >
          {GROUP_MODES.map((m, i) => (
            <option key={m.label} value={i}>
              {m.label}
            </option>
          ))}
        </Select>
        <span>these conditions</span>
        {onRemove && !disabled ? (
          <Button variant="ghost" onClick={onRemove} className="ml-auto px-2" aria-label="Remove this group">
            Remove group
          </Button>
        ) : null}
      </div>
      {problems[node.id] ? <p className="mb-2 text-[12px] text-danger">{problems[node.id]}</p> : null}
      <ul className="flex flex-col gap-2">
        {node.children.map((child) =>
          child.kind === 'condition' ? (
            <ConditionRow
              key={child.id}
              node={child}
              lookups={lookups}
              problem={problems[child.id]}
              disabled={disabled}
              onChange={(n) => onUpdate(child.id, () => n)}
              onRemove={() => onUpdate(child.id, () => null)}
            />
          ) : (
            <li key={child.id}>
              <GroupEditor
                node={child}
                depth={depth + 1}
                lookups={lookups}
                problems={problems}
                disabled={disabled}
                onUpdate={onUpdate}
                onRemove={() => onUpdate(child.id, () => null)}
              />
            </li>
          ),
        )}
      </ul>
      {!disabled ? (
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" onClick={() => onUpdate(node.id, (n) => ({ ...(n as GroupNode), children: [...(n as GroupNode).children, newCondition()] }))}>
            Add condition
          </Button>
          {canNest(depth) ? (
            <Button variant="ghost" onClick={() => onUpdate(node.id, (n) => ({ ...(n as GroupNode), children: [...(n as GroupNode).children, newGroup()] }))}>
              Add group
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The filter editor with a live count: nothing is saved until Save, and the count is always of the filter as shown. */
export function SegmentBuilder({ ws, segment, lookups, canWrite }: { ws: string; segment: Segment | null; lookups: Lookups; canWrite: boolean }) {
  const router = useRouter();
  const save = useAction();
  const [name, setName] = useState(segment?.name ?? '');
  const [root, setRoot] = useState<GroupNode>(() => rootFrom(segment?.filter ?? null));
  const [preview, setPreview] = useState<{ key: string; data: SegmentPreview } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const built = useMemo(() => toFilter(root, lookups.properties), [root, lookups.properties]);
  const filterKey = built.ok ? JSON.stringify(built.filter) : null;
  const problems = built.ok ? {} : built.problems;

  // The count follows the filter, 400 ms after the last change. An answer for
  // an older filter is dropped, so the number shown is always for what is on screen.
  useEffect(() => {
    if (!filterKey) return;
    let stale = false;
    const t = setTimeout(async () => {
      setPreviewing(true);
      const r = await previewSegment(ws, { filter: JSON.parse(filterKey) }).catch(() => null);
      if (stale) return;
      setPreviewing(false);
      if (r && r.ok) {
        setPreview({ key: filterKey, data: r.data });
        setPreviewError(null);
      } else {
        setPreviewError(r ? r.error.message : 'The dashboard did not answer.');
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [filterKey, ws]);

  const current = preview && preview.key === filterKey ? preview.data : null;
  const onUpdate = (id: string, fn: (n: FilterNode) => FilterNode | null) => setRoot((r) => updateNode(r, id, fn));
  const base = `/w/${ws}/contacts/segments`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!built.ok) return;
          void save.run(
            () => saveSegment(ws, segment?.id ?? null, { name, filter: built.filter }),
            (s) => {
              if (segment) router.refresh();
              else router.push(`${base}/${s.id}`);
            },
          );
        }}
      >
        <Field id="seg-name" label="Name" error={save.fields.name} className="max-w-[420px]">
          <Input {...describedBy('seg-name', save.fields.name)} value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} required maxLength={120} />
        </Field>
        <Panel className="p-4">
          <GroupEditor node={root} depth={1} lookups={lookups} problems={problems} disabled={!canWrite} onUpdate={onUpdate} />
        </Panel>
        <FormError error={save.error && !save.error.fields?.name ? save.error : null} />
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" busy={save.pending} disabled={!built.ok}>
              {segment ? 'Save segment' : 'Create segment'}
            </Button>
            {segment ? (
              <Button variant="ghost" onClick={() => setRemoving(true)}>
                Delete segment
              </Button>
            ) : null}
            {!built.ok ? <span className="text-[12.5px] text-faint">Complete the conditions to save.</span> : null}
          </div>
        ) : null}
      </form>
      <aside aria-label="Who matches" className="lg:sticky lg:top-6 lg:self-start">
        <Panel className="p-4">
          <p className="text-[12px] font-medium tracking-wide text-faint uppercase">Matches now</p>
          <div aria-live="polite" className="mt-1">
            {!built.ok ? (
              <p className="text-[13px] text-muted">Complete the conditions to see who matches.</p>
            ) : current ? (
              <>
                <p className="flex items-center gap-2 text-[24px] font-semibold text-ink tabular" data-testid="segment-count">
                  {formatCount(current.contact_count)}
                  {previewing ? <Spinner label="Counting" /> : null}
                </p>
                <p className="text-[12.5px] text-muted">{current.contact_count === 1 ? 'contact' : 'contacts'}</p>
                {current.sample.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1 text-[12.5px]" aria-label="Some of them">
                    {current.sample.map((c) => (
                      <li key={c.id} className="truncate">
                        <Link href={`/w/${ws}/contacts/${c.id}`} className="text-muted hover:text-ink">
                          {c.email}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <Spinner /> Counting
              </p>
            )}
            {previewError ? (
              <div className="mt-3">
                <Notice tone="danger">{previewError}</Notice>
              </div>
            ) : null}
          </div>
          <p className="mt-4 text-[12px] text-faint">
            A mailing takes whoever matches when the segment is added to it, and only those subscribed to the mailing&apos;s topic.
          </p>
        </Panel>
      </aside>
      {segment ? (
        <ConfirmDialog
          open={removing}
          onClose={() => setRemoving(false)}
          title={`Delete the segment ${segment.name}?`}
          description="The contacts stay; only the saved filter goes. Mailings that already took their recipients from it keep them."
          confirmLabel="Delete segment"
          action={() => deleteSegment(ws, segment.id)}
          onDone={() => router.push(base)}
        />
      ) : null}
    </div>
  );
}
