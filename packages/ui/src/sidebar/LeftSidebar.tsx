// packages/ui/src/sidebar/LeftSidebar.tsx
// Left sidebar with tabbed panels

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '../store';
import clsx from 'clsx';
import type { BlockRegistryImpl, PrebuiltTemplateRegistry } from '@returnhypnosis/email-editor-core';
import { ElementsPanel } from './ElementsPanel';
import { LayoutPanel } from './LayoutPanel';
import { LayersPanel } from './LayersPanel';
import { TemplateSettingsPanel } from './TemplateSettingsPanel';

interface LeftSidebarProps {
  blockRegistry: BlockRegistryImpl;
  prebuiltRegistry?: PrebuiltTemplateRegistry;
  onAddSection: (columnCount: 1 | 2 | 3) => void;
}

const TABS = ['elements', 'layout', 'layers', 'settings'] as const;

export const LeftSidebar = observer(function LeftSidebar({
  blockRegistry,
  prebuiltRegistry,
  onAddSection,
}: LeftSidebarProps) {
  const { editorUI } = useStore();

  return (
    <div className="w-64 flex flex-col border-r border-gray-200 bg-white">
      {/* Tab headers */}
      <div className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => editorUI.setActiveTab(tab)}
            className={clsx(
              'flex-1 py-3 text-xs font-medium transition-colors capitalize',
              editorUI.activeTab === tab
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
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
          />
        )}
        {editorUI.activeTab === 'layers' && <LayersPanel />}
        {editorUI.activeTab === 'settings' && <TemplateSettingsPanel />}
      </div>
    </div>
  );
});
