import 'server-only';
import type { ContactPropertyDefinition, Tag, Topic } from '@marlinjai/mail-sdk';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

/** What the segment builder offers to choose from: the defined properties, the tags, the topics, and whether engagement can be filtered on. */
export async function segmentLookups(ws: string): Promise<ActionResult<{ properties: ContactPropertyDefinition[]; tags: Tag[]; topics: Topic[]; trackingOn: boolean }>> {
  return act('segments.lookups', async () => {
    const { api } = await mail(ws);
    const collect = async <T,>(it: AsyncGenerator<T>) => {
      const all: T[] = [];
      for await (const x of it) all.push(x);
      return all;
    };
    const [properties, tags, topics, workspace] = await Promise.all([
      api.contactProperties.list(),
      collect(api.paginate('tags.list', { query: { limit: 100 } })),
      collect(api.paginate('topics.list', { query: { limit: 100 } })),
      api.workspace.get(),
    ]);
    return { properties: properties.data, tags, topics, trackingOn: workspace.settings.tracking_enabled };
  });
}
