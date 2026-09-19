'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sub-navigation within an area (settings, contacts): a row of links, the current one marked. The first tab matches its path exactly. */
export function SubTabs({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab, i) => {
        const active = i === 0 ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`relative mx-1 px-1 pt-1 pb-2.5 text-[13.5px] whitespace-nowrap transition-colors duration-150 ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {tab.label}
            {active ? <span aria-hidden="true" className="absolute right-0 bottom-[-1px] left-0 h-px bg-gold" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
