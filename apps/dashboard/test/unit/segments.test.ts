import { describe, expect, it } from 'vitest';
import type { SegmentFilter } from '@marlinjai/mail-sdk';
import { emptyRoot, newCondition, newGroup, rootFrom, toFilter, updateNode, type GroupNode } from '@/lib/segments';

const props = [
  { key: 'tier', label: 'Tier', type: 'number' as const },
  { key: 'vip', label: 'VIP', type: 'boolean' as const },
  { key: 'joined', label: 'Joined', type: 'date' as const },
];

describe('the segment builder model', () => {
  it('round-trips every shape the contract allows, not included', () => {
    const filters: SegmentFilter[] = [
      { field: 'tag', op: 'eq', value: 'vip' },
      { and: [{ field: 'topic', op: 'eq', value: 'news' }, { not: { field: 'email', op: 'contains', value: '@test.' } }] },
      { or: [{ and: [{ field: 'property:tier', op: 'gte', value: 2 }, { field: 'property:vip', op: 'eq', value: true }] }, { field: 'tag', op: 'in', value: ['a', 'b'] }] },
      { not: { or: [{ field: 'first_name', op: 'exists' }, { field: 'created_at', op: 'lt', value: '2026-01-01' }] } },
      { field: 'engagement:opened', op: 'lte', value: 30 },
    ];
    for (const f of filters) {
      const built = toFilter(rootFrom(f), props);
      expect(built).toEqual({ ok: true, filter: f });
    }
  });

  it('types values the way the service compares them', () => {
    const root: GroupNode = {
      ...emptyRoot(),
      children: [
        { ...newCondition('property:tier'), op: 'gt', value: ' 3 ' },
        { ...newCondition('property:vip'), op: 'eq', value: 'false' },
        { ...newCondition('property:joined'), op: 'gte', value: '2026-09-01' },
        { ...newCondition('property:free'), op: 'in', value: 'x, y ,' },
      ],
    };
    expect(toFilter(root, props)).toEqual({
      ok: true,
      filter: {
        and: [
          { field: 'property:tier', op: 'gt', value: 3 },
          { field: 'property:vip', op: 'eq', value: false },
          { field: 'property:joined', op: 'gte', value: '2026-09-01' },
          { field: 'property:free', op: 'in', value: ['x', 'y'] },
        ],
      },
    });
  });

  it('names what is missing, per condition, instead of sending a half-built filter', () => {
    const blank = newCondition('email');
    const badNumber = { ...newCondition('property:tier'), op: 'gt' as const, value: 'many' };
    const badDays = { ...newCondition('engagement:clicked'), op: 'gt' as const, value: '1.5' };
    const emptyGroup = { ...newGroup(), children: [] };
    const r = toFilter({ ...emptyRoot(), children: [blank, badNumber, badDays, emptyGroup] }, props);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems[blank.id]).toBe('Enter a value');
      expect(r.problems[badNumber.id]).toBe('A number');
      expect(r.problems[badDays.id]).toMatch(/days/);
      expect(r.problems[emptyGroup.id]).toMatch(/Add a condition/);
    }
  });

  it('refuses an operator the field does not take', () => {
    const c = { ...newCondition('created_at'), op: 'contains' as const, value: 'x' };
    const r = toFilter({ ...emptyRoot(), children: [c] }, props);
    expect(r.ok).toBe(false);
  });

  it('edits and removes nodes anywhere in the tree without touching the rest', () => {
    const inner = newCondition('tag');
    const group = { ...newGroup(), children: [inner] };
    const keep = { ...newCondition('email'), op: 'eq' as const, value: 'a@b.co' };
    const root: GroupNode = { ...emptyRoot(), children: [keep, group] };
    const edited = updateNode(root, inner.id, (n) => ({ ...n, value: 'vip' }) as typeof n);
    expect(toFilter(edited, props)).toEqual({ ok: true, filter: { and: [{ field: 'email', op: 'eq', value: 'a@b.co' }, { field: 'tag', op: 'eq', value: 'vip' }] } });
    const removed = updateNode(edited, group.id, () => null);
    expect(toFilter(removed, props)).toEqual({ ok: true, filter: { field: 'email', op: 'eq', value: 'a@b.co' } });
  });

  it('refuses a tree deeper than the service evaluates', () => {
    let node: GroupNode = { ...newGroup(), children: [{ ...newCondition('tag'), value: 'a' }] };
    for (let i = 0; i < 6; i++) node = { ...newGroup(), children: [node, { ...newCondition('tag'), value: 'b' }] };
    const r = toFilter(node, props);
    expect(r.ok).toBe(false);
  });
});
