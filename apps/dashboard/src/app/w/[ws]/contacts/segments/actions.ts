'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { BoundedSegmentFilter, type Segment, type SegmentPreview } from '@marlinjai/mail-sdk';
import { act, parseInput } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

const segmentsPath = (ws: string) => `/w/${ws}/contacts/segments`;

const FilterInput = z.object({ filter: BoundedSegmentFilter });
const SegmentInput = FilterInput.extend({ name: z.string().trim().min(1, 'Give the segment a name').max(120) });

/** Counts what a filter matches now, with a few addresses to check it by, without saving anything. */
export async function previewSegment(ws: string, input: z.input<typeof FilterInput>): Promise<ActionResult<SegmentPreview>> {
  const parsed = parseInput(FilterInput, input);
  if (!parsed.ok) return parsed;
  return act('segments.preview', async () => (await mail(ws)).api.segments.preview({ filter: parsed.data.filter }));
}

export async function saveSegment(ws: string, id: string | null, input: z.input<typeof SegmentInput>): Promise<ActionResult<Segment>> {
  const parsed = parseInput(SegmentInput, input);
  if (!parsed.ok) return parsed;
  return act(id ? 'segments.update' : 'segments.create', async () => {
    const { api } = await mail(ws);
    const saved = id ? await api.segments.update(id, parsed.data) : await api.segments.create(parsed.data);
    revalidatePath(segmentsPath(ws), 'layout');
    return saved;
  });
}

export async function deleteSegment(ws: string, id: string): Promise<ActionResult> {
  return act('segments.delete', async () => {
    const { api } = await mail(ws);
    await api.segments.delete(id);
    revalidatePath(segmentsPath(ws), 'layout');
    return null;
  });
}
