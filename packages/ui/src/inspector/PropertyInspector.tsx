// packages/ui/src/inspector/PropertyInspector.tsx
// Dynamic property inspector based on selected block

import type { Block } from '@returnhypnosis/email-editor-core';
import { TextField, ColorField, SelectField, AlignmentField } from './fields';
import { Trash2 } from 'lucide-react';

interface PropertyInspectorProps {
  block: Block | null;
  onChange: (updates: Partial<Block>) => void;
  onDelete: () => void;
}

/**
 * Property inspector panel
 * Shows editable properties for selected block
 */
export function PropertyInspector({
  block,
  onChange,
  onDelete,
}: PropertyInspectorProps) {
  if (!block) {
    return (
      <div className="panel w-80 flex items-center justify-center">
        <div className="text-center text-brand-text-secondary px-4">
          <p className="text-sm">Select a block to edit its properties</p>
        </div>
      </div>
    );
  }

  // Check if block is locked
  const isLocked = 'locked' in block && block.locked;

  return (
    <div className="panel w-80 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-brand-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg capitalize">{block.type} Block</h2>
          {isLocked && (
            <span className="text-xs text-brand-text-secondary">Locked</span>
          )}
        </div>
        {!isLocked && (
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded text-red-600 transition-colors"
            title="Delete block"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLocked ? (
          <div className="text-sm text-brand-text-secondary">
            This block is locked and cannot be edited.
          </div>
        ) : (
          <BlockProperties block={block} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

/**
 * Render properties based on block type
 */
function BlockProperties({
  block,
  onChange,
}: {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
}) {
  switch (block.type) {
    case 'text':
      return (
        <>
          <TextField
            label="Content"
            value={block.content}
            onChange={(content) => onChange({ content })}
            multiline
          />
          <AlignmentField
            label="Alignment"
            value={block.align}
            onChange={(align) => onChange({ align })}
            includeJustify
          />
          <ColorField
            label="Text Color"
            value={block.color}
            onChange={(color) => onChange({ color })}
          />
          <TextField
            label="Font Size"
            value={block.fontSize || ''}
            onChange={(fontSize) => onChange({ fontSize })}
            placeholder="14px"
          />
        </>
      );

    case 'image':
      return (
        <>
          <TextField
            label="Image URL"
            value={block.src}
            onChange={(src) => onChange({ src })}
            placeholder="https://..."
          />
          <TextField
            label="Alt Text"
            value={block.alt || ''}
            onChange={(alt) => onChange({ alt })}
            placeholder="Description"
          />
          <AlignmentField
            label="Alignment"
            value={block.align}
            onChange={(align) => onChange({ align })}
          />
          <TextField
            label="Width"
            value={block.width || ''}
            onChange={(width) => onChange({ width })}
            placeholder="100%"
          />
          <TextField
            label="Link URL"
            value={block.href || ''}
            onChange={(href) => onChange({ href })}
            placeholder="https://..."
          />
        </>
      );

    case 'button':
      return (
        <>
          <TextField
            label="Button Text"
            value={block.label}
            onChange={(label) => onChange({ label })}
          />
          <TextField
            label="Link URL"
            value={block.href}
            onChange={(href) => onChange({ href })}
            placeholder="https://..."
          />
          <AlignmentField
            label="Alignment"
            value={block.align}
            onChange={(align) => onChange({ align })}
          />
          <ColorField
            label="Background Color"
            value={block.backgroundColor}
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />
          <ColorField
            label="Text Color"
            value={block.color}
            onChange={(color) => onChange({ color })}
          />
          <TextField
            label="Border Radius"
            value={block.borderRadius || ''}
            onChange={(borderRadius) => onChange({ borderRadius })}
            placeholder="4px"
          />
        </>
      );

    case 'divider':
      return (
        <>
          <ColorField
            label="Border Color"
            value={block.borderColor}
            onChange={(borderColor) => onChange({ borderColor })}
          />
          <TextField
            label="Border Width"
            value={block.borderWidth || ''}
            onChange={(borderWidth) => onChange({ borderWidth })}
            placeholder="1px"
          />
          <SelectField
            label="Border Style"
            value={block.borderStyle}
            onChange={(borderStyle) =>
              onChange({ borderStyle: borderStyle as 'solid' | 'dashed' | 'dotted' })
            }
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
        </>
      );

    case 'spacer':
      return (
        <TextField
          label="Height"
          value={block.height}
          onChange={(height) => onChange({ height })}
          placeholder="20px"
        />
      );

    default:
      return (
        <div className="text-sm text-brand-text-secondary">
          No properties available for this block type.
        </div>
      );
  }
}

