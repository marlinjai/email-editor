import 'server-only';
import { requireViewer } from './viewer';

/** The signed-in person's address, the natural default for a test send. */
export async function viewerEmail(): Promise<string> {
  return (await requireViewer()).email;
}
