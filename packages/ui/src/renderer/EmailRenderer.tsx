// packages/ui/src/renderer/EmailRenderer.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import clsx from 'clsx';
import { useStore } from '../store';
import { SectionRenderer } from './SectionRenderer';

interface EmailRendererProps {
  /** Additional class names */
  className?: string;
}

/**
 * EmailRenderer - Root renderer for email templates
 *
 * This is the main preview component that renders the entire email template
 * using React components instead of MJML compilation.
 *
 * Key benefits:
 * - Instant updates (<16ms) on property changes
 * - Fine-grained reactivity (only changed blocks re-render)
 * - No iframe needed
 * - MJML compilation only happens on export
 */
export const EmailRenderer = observer(({ className }: EmailRendererProps) => {
  const { template, editorUI } = useStore();

  // Preview width based on device
  const previewWidth = editorUI.previewDevice === 'mobile' ? 375 : 600;

  return (
    <div
      className={clsx(
        'email-renderer bg-white shadow-lg rounded-lg overflow-hidden',
        className
      )}
      style={{
        width: previewWidth,
        margin: '0 auto',
        fontFamily: 'Georgia, serif',
        fontSize: '14px',
        lineHeight: 1.6,
        color: '#333333',
        transform: `scale(${editorUI.zoomLevel})`,
        transformOrigin: 'top center',
      }}
      onClick={(e) => {
        // Clear selection when clicking empty area
        if (e.target === e.currentTarget) {
          editorUI.clearSelection();
        }
      }}
    >
      {/* Email content */}
      <div className="email-content">
        {template.sections.map((section, index) => (
          <SectionRenderer
            key={section.id}
            section={section}
            sectionIndex={index}
          />
        ))}

        {/* Empty state */}
        {template.sections.length === 0 && (
          <EmptyStateDropZone />
        )}
      </div>
    </div>
  );
});

EmailRenderer.displayName = 'EmailRenderer';

/**
 * EmptyStateDropZone - Shown when template has no sections
 */
const EmptyStateDropZone = observer(() => {
  const { editorUI } = useStore();

  return (
    <div
      className={clsx(
        'empty-state p-12 min-h-[400px] flex flex-col items-center justify-center',
        'border-2 border-dashed border-gray-200 rounded-lg m-4',
        editorUI.isDragging && 'border-blue-400 bg-blue-50'
      )}
    >
      <div className="text-gray-400 text-center">
        <div className="text-4xl mb-4">📧</div>
        <h3 className="text-lg font-medium mb-2">Start building your email</h3>
        <p className="text-sm">
          Drag sections or blocks from the sidebar to get started
        </p>
      </div>
    </div>
  );
});

EmptyStateDropZone.displayName = 'EmptyStateDropZone';

/**
 * Hook to get the email renderer width
 */
export function usePreviewWidth(): number {
  const { editorUI } = useStore();
  return editorUI.previewDevice === 'mobile' ? 375 : 600;
}
