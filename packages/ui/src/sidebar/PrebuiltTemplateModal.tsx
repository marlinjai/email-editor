// packages/ui/src/sidebar/PrebuiltTemplateModal.tsx
// Editorial-style modal browser for the pre-built section templates.

import React, { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import clsx from 'clsx';
import type { PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { PrebuiltTemplateCard } from './PrebuiltTemplateCard';

interface PrebuiltTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: PrebuiltTemplate[];
  onSelect: (template: PrebuiltTemplate) => void;
}

const ALL = '__all__';

export function PrebuiltTemplateModal({
  open,
  onOpenChange,
  templates,
  onSelect,
}: PrebuiltTemplateModalProps) {
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  // Build category list from the actual templates so new categories show up automatically.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([id, count]) => ({ id, count }));
  }, [templates]);

  const filtered = useMemo(
    () =>
      activeCategory === ALL
        ? templates
        : templates.filter((t) => t.category === activeCategory),
    [templates, activeCategory]
  );

  const handleSelect = (template: PrebuiltTemplate) => {
    onSelect(template);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={clsx(
            'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
          )}
        />
        <Dialog.Content
          className={clsx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[min(1280px,95vw)] h-[min(880px,92vh)]',
            'bg-[#fafaf7] rounded-2xl shadow-2xl flex flex-col overflow-hidden',
            'ring-1 ring-black/10',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          {/* Header */}
          <header className="px-8 pt-7 pb-5 flex items-start justify-between gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700/80 font-medium mb-1.5">
                Template Library
              </p>
              <Dialog.Title className="font-serif text-[28px] leading-none text-neutral-900 mb-2">
                Pre-built sections
              </Dialog.Title>
              <Dialog.Description className="text-sm text-neutral-500 max-w-md">
                Click any layout to drop it at the end of your email. Each preview is a live render of the actual section.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className={clsx(
                  'shrink-0 p-2 rounded-full text-neutral-400',
                  'hover:bg-black/5 hover:text-neutral-700 transition-colors'
                )}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>

          {/* Filter row */}
          <div className="px-8 pb-5">
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-black/[0.04] ring-1 ring-black/[0.04]">
              <CategoryChip
                label="All"
                count={templates.length}
                active={activeCategory === ALL}
                onClick={() => setActiveCategory(ALL)}
              />
              {categories.map(({ id, count }) => (
                <CategoryChip
                  key={id}
                  label={id}
                  count={count}
                  active={activeCategory === id}
                  onClick={() => setActiveCategory(id)}
                />
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-8 pb-8">
            {filtered.length === 0 ? (
              <div className="text-center text-neutral-500 text-sm py-16">
                No templates in this category.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((template) => (
                  <PrebuiltTemplateCard
                    key={template.id}
                    template={template}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all',
        'flex items-center gap-1.5',
        active
          ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-black/[0.06]'
          : 'text-neutral-500 hover:text-neutral-800'
      )}
    >
      <span>{label}</span>
      <span
        className={clsx(
          'text-[10px] tabular-nums',
          active ? 'text-amber-700/80' : 'text-neutral-400'
        )}
      >
        {count}
      </span>
    </button>
  );
}
