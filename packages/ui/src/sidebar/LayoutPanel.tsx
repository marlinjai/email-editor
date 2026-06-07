// packages/ui/src/sidebar/LayoutPanel.tsx
// Layout panel with section structure options

import React, { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import clsx from 'clsx';
import type { PrebuiltTemplate } from '@marlinjai/email-editor-core';
import { PrebuiltTemplateModal } from './PrebuiltTemplateModal';

interface LayoutPanelProps {
  templates: PrebuiltTemplate[];
  onAddSection: (columns: 1 | 2 | 3) => void;
  onAddPrebuilt: (template: PrebuiltTemplate) => void;
}

type LayoutTab = 'sections' | 'prebuilt';

export function LayoutPanel({ templates, onAddSection, onAddPrebuilt }: LayoutPanelProps) {
  const [activeTab, setActiveTab] = useState<LayoutTab>('sections');
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-border-light bg-canvas-1">
        <button
          onClick={() => setActiveTab('sections')}
          className={clsx(
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeTab === 'sections'
              ? 'text-accent border-b-2 border-accent bg-canvas-2'
              : 'text-text-dark-muted hover:text-text-dark'
          )}
        >
          Sections
        </button>
        <button
          onClick={() => setActiveTab('prebuilt')}
          className={clsx(
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeTab === 'prebuilt'
              ? 'text-accent border-b-2 border-accent bg-canvas-2'
              : 'text-text-dark-muted hover:text-text-dark'
          )}
        >
          Pre-built
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'sections' && <SectionStructures onAddSection={onAddSection} />}
        {activeTab === 'prebuilt' && (
          <PrebuiltLauncher
            templateCount={templates.length}
            onOpen={() => setModalOpen(true)}
          />
        )}
      </div>

      <PrebuiltTemplateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        templates={templates}
        onSelect={onAddPrebuilt}
      />
    </div>
  );
}

// === Section Structures ===

function SectionStructures({ onAddSection }: { onAddSection: (cols: 1 | 2 | 3) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-text-dark-muted uppercase mb-2">
          Add Section
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <SectionButton columns={1} onClick={() => onAddSection(1)} />
          <SectionButton columns={2} onClick={() => onAddSection(2)} />
          <SectionButton columns={3} onClick={() => onAddSection(3)} />
        </div>
      </div>

      <p className="text-xs text-text-dark-muted text-center">
        Click to add a section with the specified column layout.
      </p>
    </div>
  );
}

function SectionButton({ columns, onClick }: { columns: 1 | 2 | 3; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center p-3 rounded-lg border border-border-light hover:border-accent hover:bg-accent/5 transition-colors"
    >
      <div className="flex gap-1 mb-1">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-8 bg-canvas-3 rounded-sm"
          />
        ))}
      </div>
      <span className="text-xs text-text-dark-muted">
        {columns} {columns === 1 ? 'Column' : 'Columns'}
      </span>
    </button>
  );
}

// === Pre-built Launcher ===

function PrebuiltLauncher({
  templateCount,
  onOpen,
}: {
  templateCount: number;
  onOpen: () => void;
}) {
  if (templateCount === 0) {
    return (
      <div className="text-center text-text-dark-muted text-sm py-8">
        No pre-built templates available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={onOpen}
        className={clsx(
          'w-full flex flex-col items-center gap-2 p-6 rounded-lg',
          'border border-dashed border-border-light hover:border-accent hover:bg-accent/5',
          'text-text-dark transition-colors'
        )}
      >
        <LayoutTemplate size={28} className="text-accent" />
        <span className="text-sm font-semibold">Browse pre-built sections</span>
        <span className="text-xs text-text-dark-muted">
          {templateCount} ready-made layouts
        </span>
      </button>

      <p className="text-xs text-text-dark-muted text-center">
        Visual previews open in a full-size browser.
      </p>
    </div>
  );
}
