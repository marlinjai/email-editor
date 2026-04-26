// packages/ui/src/sidebar/PrebuiltTemplateModal.tsx
// Modal browser for the pre-built section templates with live mini-renders.

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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={clsx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[min(1100px,95vw)] h-[min(800px,90vh)]',
            'bg-canvas-2 rounded-xl shadow-2xl flex flex-col overflow-hidden'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
            <div>
              <Dialog.Title className="text-base font-semibold text-text-dark">
                Pre-built sections
              </Dialog.Title>
              <Dialog.Description className="text-xs text-text-dark-muted">
                Click a section to insert it at the end of your email.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded hover:bg-canvas-3 text-text-dark-muted hover:text-text-dark"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-border-light">
            <CategoryChip
              label={`All (${templates.length})`}
              active={activeCategory === ALL}
              onClick={() => setActiveCategory(ALL)}
            />
            {categories.map(({ id, count }) => (
              <CategoryChip
                key={id}
                label={`${id} (${count})`}
                active={activeCategory === id}
                onClick={() => setActiveCategory(id)}
              />
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-5">
            {filtered.length === 0 ? (
              <div className="text-center text-text-dark-muted text-sm py-12">
                No templates in this category.
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors',
        active
          ? 'bg-accent text-white'
          : 'bg-canvas-3 text-text-dark-muted hover:text-text-dark hover:bg-canvas-1'
      )}
    >
      {label}
    </button>
  );
}
