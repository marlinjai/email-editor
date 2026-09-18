import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { decodeTestIdentity, TEST_AUTH_COOKIE, testAuthEnabled } from './test-auth';

/** A company (auth-brain tenant) the signed-in person may create mail workspaces for. */
export type Company = { id: string; name: string };

/** The signed-in person, as every server component and action sees them. */
export type Viewer = {
  /** auth-brain subject: what the mail service knows the person by. */
  subject: string;
  email: string;
  name: string | null;
  /** The person's companies that hold the `mail` app grant. */
  companies: Company[];
  /** The company auth-brain has active for the person, when it is one of `companies`. */
  activeCompanyId: string | null;
};

export async function getViewer(): Promise<Viewer | null> {
  if (testAuthEnabled()) {
    const identity = decodeTestIdentity((await cookies()).get(TEST_AUTH_COOKIE)?.value);
    if (identity) return { ...identity, activeCompanyId: identity.companies[0]?.id ?? null };
  }
  const session = await auth.getSession();
  if (!session) return null;
  const companies = new Map<string, Company>();
  for (const m of session.memberships) {
    if (!companies.has(m.tenantId)) companies.set(m.tenantId, { id: m.tenantId, name: m.tenantName || m.tenantId });
  }
  const active = session.activeWorkspace?.tenantId ?? null;
  return {
    subject: session.userId,
    email: session.email,
    name: null,
    companies: [...companies.values()],
    activeCompanyId: active && companies.has(active) ? active : ([...companies.keys()][0] ?? null),
  };
}

/** The viewer, or a redirect to the sign-in page (the proxy normally got there first). */
export async function requireViewer(returnTo = '/'): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?return_to=${encodeURIComponent(returnTo)}`);
  return viewer;
}
