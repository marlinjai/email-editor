// packages/ui/src/sidebar/LeftSidebar.tsx
// Left sidebar with tabbed panels

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import clsx from 'clsx';
import type {
  BlockRegistryImpl,
  PrebuiltTemplate,
  PrebuiltTemplateRegistry,
} from '@marlinjai/email-editor-core';
import { ElementsPanel } from './ElementsPanel';
import { LayoutPanel } from './LayoutPanel';
import { LayersPanel } from './LayersPanel';
import { TemplateSettingsPanel } from './TemplateSettingsPanel';

interface LeftSidebarProps {
  blockRegistry: BlockRegistryImpl;
  prebuiltRegistry?: PrebuiltTemplateRegistry;
  onAddSection: (columnCount: 1 | 2 | 3) => void;
  onAddPrebuilt: (template: PrebuiltTemplate) => void;
}

const TABS = ['elements', 'layout', 'layers', 'settings'] as const;

export const LeftSidebar = observer(function LeftSidebar({
  blockRegistry,
  prebuiltRegistry,
  onAddSection,
  onAddPrebuilt,
}: LeftSidebarProps) {
  const { editorUI } = useStore();

  return (
    <div className="w-64 flex flex-col border-r border-border-light bg-canvas-2">
      {/* Tab headers */}
      <div className="flex border-b border-border-light">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => editorUI.setActiveTab(tab)}
            className={clsx(
              'flex-1 py-3 text-xs font-medium transition-colors capitalize',
              editorUI.activeTab === tab
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-dark-muted hover:text-text-dark hover:bg-canvas-1'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {editorUI.activeTab === 'elements' && (
          <ElementsPanel blocks={blockRegistry.getAll()} />
        )}
        {editorUI.activeTab === 'layout' && (
          <LayoutPanel
            templates={prebuiltRegistry?.getAll() || []}
            onAddSection={onAddSection}
            onAddPrebuilt={onAddPrebuilt}
          />
        )}
        {editorUI.activeTab === 'layers' && <LayersPanel />}
        {editorUI.activeTab === 'settings' && <TemplateSettingsPanel />}
      </div>
    </div>
  );
});
