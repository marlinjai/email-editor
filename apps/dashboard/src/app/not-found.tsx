import { LinkButton } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-24">
      <h1 className="text-[20px] font-semibold">Not found</h1>
      <p className="mt-2 text-[14px] text-muted">This page does not exist, or what it showed has been deleted.</p>
      <LinkButton href="/" variant="primary" className="mt-6">
        Go to my workspaces
      </LinkButton>
    </main>
  );
}
