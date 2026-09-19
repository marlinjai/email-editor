'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { MemberRole, UsageWarning } from '@marlinjai/mail-contract';
import { can, ROLE_LABELS } from '@/lib/roles';
import { billingPath, usageWarningSummary } from '@/lib/usage';
import { BrandMark } from './brand';
import {
  IconArchive,
  IconAudit,
  IconBlock,
  IconCheck,
  IconChevrons,
  IconClose,
  IconContacts,
  IconMenu,
  IconOverview,
  IconPlus,
  IconSend,
  IconSettings,
  IconTemplate,
} from './icons';

type WorkspaceItem = { id: string; name: string; role: MemberRole };

const LAST_WORKSPACE_COOKIE = 'mail_last_ws';

function navFor(base: string, role: MemberRole) {
  return [
    { href: base, label: 'Overview', icon: <IconOverview />, exact: true },
    { href: `${base}/mailings`, label: 'Mailings', icon: <IconSend /> },
    { href: `${base}/templates`, label: 'Templates', icon: <IconTemplate /> },
    { href: `${base}/archive`, label: 'Sent archive', icon: <IconArchive /> },
    { href: `${base}/contacts`, label: 'Contacts', icon: <IconContacts /> },
    { href: `${base}/suppressions`, label: 'Suppressions', icon: <IconBlock /> },
    ...(can(role, 'admin') ? [{ href: `${base}/audit`, label: 'Audit log', icon: <IconAudit /> }] : []),
    { href: `${base}/settings`, label: 'Settings', icon: <IconSettings /> },
  ];
}

/** The workspace switcher: a disclosure listing every workspace, keyboard operable. */
function WorkspaceSwitcher({ current, workspaces }: { current: WorkspaceItem; workspaces: WorkspaceItem[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left transition-colors duration-150 hover:border-line-strong hover:bg-white/[0.03]"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-raised text-[12px] font-semibold text-gold">
          {current.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">{current.name}</span>
          <span className="block text-[11.5px] text-faint">{ROLE_LABELS[current.role]}</span>
        </span>
        <IconChevrons />
        <span className="sr-only">Switch workspace</span>
      </button>
      {open ? (
        <div
          id={menuId}
          className="absolute top-full right-0 left-0 z-40 mt-1.5 rounded-xl border border-line-strong bg-panel-2 p-1.5 shadow-[var(--shadow-pop)]"
        >
          <ul className="max-h-[50vh] overflow-y-auto" aria-label="Workspaces">
            {workspaces.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/w/${w.id}`}
                  aria-current={w.id === current.id ? 'true' : undefined}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <span className="text-[11.5px] text-faint">{ROLE_LABELS[w.role]}</span>
                  {w.id === current.id ? (
                    <span className="text-gold">
                      <IconCheck />
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/workspaces/new');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-white/5 hover:text-ink"
            >
              <IconPlus /> New workspace
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The plan's usage warning, above every page of the workspace until the usage
 * falls back or the plan changes. Hidden on the Billing screen, which shows
 * the same numbers in full.
 */
function UsageBanner({ ws, warnings, pathname }: { ws: string; warnings: UsageWarning[]; pathname: string }) {
  const summary = usageWarningSummary(warnings);
  if (!summary || pathname === billingPath(ws)) return null;
  const reached = summary.level === 'reached';
  return (
    <div
      role="status"
      data-testid="usage-banner"
      className={`mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3.5 py-2.5 text-[13px] ${
        reached ? 'border-[rgba(255,138,128,0.3)] bg-danger-wash text-ink' : 'border-[rgba(240,192,90,0.22)] bg-warn-wash text-ink'
      }`}
    >
      <p>{summary.text}</p>
      <Link href={billingPath(ws)} className="shrink-0 font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink">
        Plans and usage
      </Link>
    </div>
  );
}

export function Shell({
  current,
  workspaces,
  email,
  signOutHref,
  usageWarnings = [],
  children,
}: {
  current: WorkspaceItem;
  workspaces: WorkspaceItem[];
  email: string;
  signOutHref: string;
  usageWarnings?: UsageWarning[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const base = `/w/${current.id}`;
  const nav = navFor(base, current.role);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Remember the workspace for the next visit. A preference only: the server
  // checks it against the person's memberships before using it.
  useEffect(() => {
    document.cookie = `${LAST_WORKSPACE_COOKIE}=${encodeURIComponent(current.id)}; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
  }, [current.id]);

  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => setMobileOpen(false), [pathname]);
  // The drawer is a native modal <dialog>: focus is trapped and Escape closes it.
  useEffect(() => {
    const el = drawer.current;
    if (!el) return;
    if (mobileOpen && !el.open) el.showModal();
    if (!mobileOpen && el.open) el.close();
  }, [mobileOpen]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-5 px-3 py-4">
      <Link href="/" className="flex items-center gap-2.5 px-1.5">
        <BrandMark size={26} />
        <span className="text-[14px] font-semibold tracking-[-0.01em]">Lumitra Mail</span>
      </Link>
      <WorkspaceSwitcher current={current} workspaces={workspaces} />
      <ul className="flex flex-col gap-0.5">
        {nav.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors duration-150 ${
                  active ? 'bg-gold-wash text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
                }`}
              >
                {active ? <span aria-hidden="true" className="absolute top-1.5 bottom-1.5 left-0 w-px bg-gold" /> : null}
                <span className={active ? 'text-gold' : ''}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-line px-1.5 pt-4">
        <p className="truncate text-[12.5px] text-muted" title={email}>
          {email}
        </p>
        <a href={signOutHref} className="mt-1 inline-block text-[12.5px] text-faint underline decoration-line-strong hover:text-ink">
          Sign out
        </a>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-lg bg-panel px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 border-r border-line bg-[rgba(10,9,7,0.72)] lg:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-black/80 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-muted hover:text-ink"
          >
            <IconMenu />
          </button>
          <span className="truncate text-[13.5px] font-semibold">{current.name}</span>
        </div>
        <dialog
          ref={drawer}
          aria-label="Navigation"
          onClose={() => setMobileOpen(false)}
          onClick={(e) => {
            if (e.target === drawer.current) setMobileOpen(false);
          }}
          className="m-0 h-dvh max-h-none w-[272px] border-r border-line bg-panel p-0 lg:hidden"
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="absolute top-3 right-3 rounded-lg p-2 text-muted hover:text-ink"
          >
            <IconClose />
          </button>
          {sidebar}
        </dialog>
        <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-8 sm:px-8">
          <UsageBanner ws={current.id} warnings={usageWarnings} pathname={pathname} />
          {children}
        </main>
      </div>
    </div>
  );
}
