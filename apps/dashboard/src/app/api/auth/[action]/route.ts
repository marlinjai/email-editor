import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

// The three auth-brain OpenID Connect handlers under /api/auth: `login` starts
// the code flow, `callback` finishes it and mints the dashboard's own session
// cookie, `logout` clears it. The package marks them public in the proxy.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = auth.oidcHandlers();

export async function GET(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const handler = handlers[action as keyof typeof handlers];
  if (!handler) return new NextResponse(null, { status: 404 });
  return handler(req);
}
