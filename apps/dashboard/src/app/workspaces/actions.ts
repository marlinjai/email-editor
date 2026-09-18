'use server';

import { z } from 'zod';
import { Slug } from '@marlinjai/mail-sdk';
import { act, parseInput } from '@/lib/action';
import { mail } from '@/lib/mail';
import type { ActionResult } from '@/lib/result';

const CreateWorkspaceInput = z.object({
  name: z.string().trim().min(1, 'Give the workspace a name').max(120),
  slug: Slug,
  companyId: z.string().min(1, 'Choose the company this workspace belongs to'),
});

/**
 * Creates a mail workspace for one of the person's companies; they become its
 * owner. The company is checked against the verified session, never taken
 * from the form on trust, because it decides which company's erasure removes
 * the workspace.
 */
export async function createWorkspace(input: z.input<typeof CreateWorkspaceInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(CreateWorkspaceInput, input);
  if (!parsed.ok) return parsed;
  const { api, viewer } = await mail();
  const company = viewer.companies.find((c) => c.id === parsed.data.companyId);
  if (!company) {
    return {
      ok: false,
      error: { code: 'forbidden', message: 'You can only create a workspace for a company you belong to.', fields: { companyId: 'Choose one of your companies' } },
    };
  }
  return act('workspaces.create', async () => {
    const ws = await api.workspaces.create({
      name: parsed.data.name,
      slug: parsed.data.slug,
      company_id: company.id,
      owner: { email: viewer.email, name: viewer.name },
    });
    return { id: ws.id };
  });
}
