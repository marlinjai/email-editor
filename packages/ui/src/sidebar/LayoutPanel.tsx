// packages/ui/src/sidebar/LayoutPanel.tsx
// Layout panel with section structure options

import React, { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Columns, Square, Layout } from 'lucide-react';
import clsx from 'clsx';
import type { PrebuiltTemplate } from '@returnhypnosis/email-editor-core';

interface LayoutPanelProps {
  templates: PrebuiltTemplate[];
  onAddSection: (columns: 1 | 2 | 3) => void;
}

type LayoutTab = 'sections' | 'prebuilt';

export function LayoutPanel({ templates, onAddSection }: LayoutPanelProps) {
  const [activeTab, setActiveTab] = useState<LayoutTab>('sections');

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setActiveTab('sections')}
          className={clsx(
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeTab === 'sections'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Sections
        </button>
        <button
          onClick={() => setActiveTab('prebuilt')}
          className={clsx(
            'flex-1 py-2 text-xs font-medium transition-colors',
            activeTab === 'prebuilt'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          Pre-built
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'sections' && <SectionStructures onAddSection={onAddSection} />}
        {activeTab === 'prebuilt' && <PrebuiltTemplates templates={templates} />}
      </div>
    </div>
  );
}

// === Section Structures ===

function SectionStructures({ onAddSection }: { onAddSection: (cols: 1 | 2 | 3) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Add Section
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <SectionButton columns={1} onClick={() => onAddSection(1)} />
          <SectionButton columns={2} onClick={() => onAddSection(2)} />
          <SectionButton columns={3} onClick={() => onAddSection(3)} />
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Click to add a section with the specified column layout.
      </p>
    </div>
  );
}

function SectionButton({ columns, onClick }: { columns: 1 | 2 | 3; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center p-3 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors"
    >
      <div className="flex gap-1 mb-1">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-8 bg-gray-300 rounded-sm"
          />
        ))}
      </div>
      <span className="text-xs text-gray-600">
        {columns} {columns === 1 ? 'Column' : 'Columns'}
      </span>
    </button>
  );
}

// === Pre-built Templates ===

function PrebuiltTemplates({ templates }: { templates: PrebuiltTemplate[] }) {
  if (templates.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-8">
        No pre-built templates available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
        Drag to Add
      </h4>
      {templates.map((template) => (
        <PrebuiltTemplateItem key={template.id} template={template} />
      ))}
    </div>
  );
}

function PrebuiltTemplateItem({ template }: { template: PrebuiltTemplate }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `template-${template.id}`,
    data: { templateId: template.id },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={clsx(
        'p-3 rounded-lg border border-gray-200 cursor-grab',
        'hover:border-blue-500 hover:bg-blue-50 transition-colors',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-2">
        <Layout size={16} className="text-gray-400" />
        <span className="text-sm font-medium text-gray-700">{template.name}</span>
      </div>
      {template.description && (
        <p className="mt-1 text-xs text-gray-500">{template.description}</p>
      )}
    </div>
  );
}
