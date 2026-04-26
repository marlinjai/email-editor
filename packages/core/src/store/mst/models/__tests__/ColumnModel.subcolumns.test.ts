import { describe, it, expect } from 'vitest';
import { ColumnModel, createColumn } from '../ColumnModel';
import { BlockType } from '../BlockModel';

describe('ColumnModel sub-columns', () => {
  it('starts as kind=leaf', () => {
    const c = ColumnModel.create(createColumn());
    expect(c.kind).toBe('leaf');
    expect(c.subColumns.length).toBe(0);
  });

  it('splitIntoSubColumns(2) migrates existing blocks into sub-column 1', () => {
    const c = ColumnModel.create({
      ...createColumn(),
      blocks: [
        { id: 't1', type: BlockType.TEXT, content: 'a' } as any,
        { id: 't2', type: BlockType.TEXT, content: 'b' } as any,
      ],
    });
    c.splitIntoSubColumns(2);
    expect(c.kind).toBe('group');
    expect(c.blocks.length).toBe(0);
    expect(c.subColumns.length).toBe(2);
    expect(c.subColumns[0].blocks.map(b => b.id)).toEqual(['t1', 't2']);
    expect(c.subColumns[1].blocks.length).toBe(0);
    expect(c.subColumns[0].width + c.subColumns[1].width).toBeCloseTo(100, 2);
  });

  it('splitIntoSubColumns(3) distributes width close to evenly', () => {
    const c = ColumnModel.create(createColumn());
    c.splitIntoSubColumns(3);
    const widths = c.subColumns.map(s => s.width);
    expect(widths.length).toBe(3);
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 2);
    // Each within +/- 1 of 33.33
    for (const w of widths) {
      expect(w).toBeGreaterThan(32);
      expect(w).toBeLessThan(35);
    }
  });

  it('rejects split count outside 2..4', () => {
    const c = ColumnModel.create(createColumn());
    expect(() => c.splitIntoSubColumns(1 as any)).toThrow();
    expect(() => c.splitIntoSubColumns(5 as any)).toThrow();
  });

  it('mergeSubColumns concatenates blocks in order', () => {
    const c = ColumnModel.create(createColumn());
    c.splitIntoSubColumns(2);
    c.subColumns[0].addBlock({ id: 't1', type: BlockType.TEXT, content: 'a' } as any);
    c.subColumns[1].addBlock({ id: 't2', type: BlockType.TEXT, content: 'b' } as any);
    c.mergeSubColumns();
    expect(c.kind).toBe('leaf');
    expect(c.subColumns.length).toBe(0);
    expect(c.blocks.map(b => b.id)).toEqual(['t1', 't2']);
  });

  it('addBlock on a group-kind column throws', () => {
    const c = ColumnModel.create(createColumn());
    c.splitIntoSubColumns(2);
    expect(() =>
      c.addBlock({ id: 'x', type: BlockType.TEXT, content: 'x' } as any),
    ).toThrow(/group/);
  });

  it('snapshot loading rejects both blocks and subColumns set', () => {
    expect(() =>
      ColumnModel.create({
        id: 'bad',
        width: 100,
        blocks: [{ id: 't1', type: BlockType.TEXT, content: 'a' } as any],
        subColumns: [{ id: 's1', width: 100, blocks: [] }],
      } as any),
    ).toThrow();
  });
});
