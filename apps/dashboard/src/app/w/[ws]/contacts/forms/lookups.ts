import 'server-only';
import { act } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';
import type { FormLookups } from './editor';

export async function formLookups(ws: string): Promise<ActionResult<FormLookups>> {
  return act('signupForms.lookups', async () => {
    const { api } = await mail(ws);
    const collect = async <T,>(it: AsyncGenerator<T>) => {
      const all: T[] = [];
      for await (const x of it) all.push(x);
      return all;
    };
    const [topics, tags, providers, templates] = await Promise.all([
      collect(api.paginate('topics.list', { query: { limit: 100 } })),
      collect(api.paginate('tags.list', { query: { limit: 100 } })),
      collect(api.paginate('providers.list', { query: { limit: 100 } })),
      collect(api.paginate('templates.list', { query: { limit: 100 } })),
    ]);
    return { topics, tags, providers, templates };
  });
}
