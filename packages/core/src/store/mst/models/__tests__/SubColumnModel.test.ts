import { describe, it, expect } from 'vitest';
import { SubColumnModel, createSubColumn } from '../SubColumnModel';
import { BlockType } from '../BlockModel';

describe('SubColumnModel', () => {
  it('creates with defaults', () => {
    const sc = SubColumnModel.create(createSubColumn());
    expect(sc.id).toBeTruthy();
    expect(sc.width).toBe(50);
    expect(sc.blocks.length).toBe(0);
    expect(sc.isEmpty).toBe(true);
  });

  it('rejects container blocks via addBlock', () => {
    const sc = SubColumnModel.create(createSubColumn());
    expect(() =>
      sc.addBlock({ id: 'h1', type: BlockType.HERO } as any),
    ).toThrow(/leaf/i);
  });

  it('accepts a leaf block', () => {
    const sc = SubColumnModel.create(createSubColumn());
    sc.addBlock({ id: 't1', type: BlockType.TEXT, content: 'hi' } as any);
    expect(sc.blocks.length).toBe(1);
  });

  it('removeBlock destroys', () => {
    const sc = SubColumnModel.create({
      ...createSubColumn(),
      blocks: [{ id: 't1', type: BlockType.TEXT, content: 'hi' } as any],
    });
    expect(sc.removeBlock('t1')).toBe(true);
    expect(sc.blocks.length).toBe(0);
  });

  it('setWidth clamps 0..100', () => {
    const sc = SubColumnModel.create(createSubColumn({ width: 50 }));
    sc.setWidth(150);
    expect(sc.width).toBe(100);
    sc.setWidth(-5);
    expect(sc.width).toBe(0);
  });
});
