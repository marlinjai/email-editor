// packages/ui/src/inspector/properties/BlockProperties.tsx
// Block-specific property panels

import React from 'react';
import { observer } from 'mobx-react-lite';
import { BlockType, type BlockInstance } from '@returnhypnosis/email-editor-core';
import { Trash2, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../../store';
import {
  TextField,
  ColorField,
  SelectField,
  AlignmentField,
  SpacingField,
  FormattingToolbar,
} from '../fields';

/**
 * Hook to get theme colors from template metadata
 */
function useThemeColors() {
  const { template } = useStore();
  return template.metadata.themeColors.map(c => ({
    name: c.name,
    value: c.value,
  }));
}

interface BlockPropertiesProps {
  block: BlockInstance;
  onDelete: () => void;
}

/**
 * Main block properties panel - routes to type-specific panels
 */
export const BlockProperties = observer(function BlockProperties({
  block,
  onDelete,
}: BlockPropertiesProps) {
  return (
    <div className="p-4 space-y-4">
      <BlockHeader block={block} onDelete={onDelete} />
      <TypeSpecificProperties block={block} />
      <CommonPaddingProperties block={block} />
    </div>
  );
});

/**
 * Block header with title and action buttons
 */
const BlockHeader = observer(function BlockHeader({
  block,
  onDelete,
}: {
  block: BlockInstance;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-sm capitalize">{block.type} Block</h3>
      <div className="flex gap-1">
        <button
          onClick={() => block.toggleHidden()}
          className={clsx(
            'p-1.5 rounded hover:bg-gray-100',
            block.hidden && 'text-amber-500'
          )}
          title={block.hidden ? 'Show block' : 'Hide block'}
        >
          <EyeOff size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-red-50 text-red-500"
          title="Delete block"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

/**
 * Routes to type-specific property panel
 */
const TypeSpecificProperties = observer(function TypeSpecificProperties({
  block,
}: {
  block: BlockInstance;
}) {
  switch (block.type) {
    case BlockType.TEXT:
      return <TextBlockProperties block={block} />;
    case BlockType.IMAGE:
      return <ImageBlockProperties block={block} />;
    case BlockType.BUTTON:
      return <ButtonBlockProperties block={block} />;
    case BlockType.DIVIDER:
      return <DividerBlockProperties block={block} />;
    case BlockType.SPACER:
      return <SpacerBlockProperties block={block} />;
    case BlockType.SOCIAL:
      return <SocialBlockProperties block={block} />;
    case BlockType.HERO:
      return <HeroBlockProperties block={block} />;
    default:
      return (
        <div className="text-sm text-gray-500">
          No properties available for this block type
        </div>
      );
  }
});

/**
 * Common padding properties for all blocks
 */
const CommonPaddingProperties = observer(function CommonPaddingProperties({
  block,
}: {
  block: BlockInstance;
}) {
  return (
    <SpacingField
      label="Padding"
      top={block.paddingTop || undefined}
      right={block.paddingRight || undefined}
      bottom={block.paddingBottom || undefined}
      left={block.paddingLeft || undefined}
      onChange={(side, value) => {
        const prop = `padding${side.charAt(0).toUpperCase()}${side.slice(1)}`;
        block.updateStyle(prop, value);
      }}
    />
  );
});

// === Type-Specific Property Panels ===

const TextBlockProperties = observer(function TextBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  const themeColors = useThemeColors();
  return (
    <>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Formatting</label>
        <FormattingToolbar />
        <p className="text-xs text-gray-400">Select text in block, then click to format</p>
      </div>
      <ColorField
        label="Text Color"
        value={block.color || '#000000'}
        onChange={(color) => block.updateStyle('color', color)}
        themeColors={themeColors}
      />
      <ColorField
        label="Background"
        value={block.backgroundColor || ''}
        onChange={(color) => block.updateStyle('backgroundColor', color || undefined)}
        allowEmpty
        themeColors={themeColors}
      />
      <SelectField
        label="Font Size"
        value={block.fontSize || '14px'}
        options={['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px']}
        onChange={(size) => block.updateStyle('fontSize', size)}
      />
      <SelectField
        label="Font Family"
        value={block.fontFamily || 'Georgia, serif'}
        options={[
          'Georgia, serif',
          'Arial, sans-serif',
          'Helvetica, sans-serif',
          'Verdana, sans-serif',
          'Times New Roman, serif',
          'Courier New, monospace',
        ]}
        onChange={(font) => block.updateStyle('fontFamily', font)}
      />
      <AlignmentField
        value={block.align || 'left'}
        onChange={(align) => block.updateStyle('align', align)}
      />
      <SelectField
        label="Line Height"
        value={block.lineHeight || '1.6'}
        options={['1', '1.2', '1.4', '1.6', '1.8', '2', '2.5']}
        onChange={(lh) => block.updateStyle('lineHeight', lh)}
      />
    </>
  );
});

const ImageBlockProperties = observer(function ImageBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  return (
    <>
      <TextField
        label="Image URL"
        value={block.src || ''}
        onChange={(src) => block.updateStyle('src', src)}
        placeholder="https://..."
      />
      <TextField
        label="Alt Text"
        value={block.alt || ''}
        onChange={(alt) => block.updateStyle('alt', alt)}
        placeholder="Image description"
      />
      <TextField
        label="Link URL"
        value={block.href || ''}
        onChange={(href) => block.updateStyle('href', href || undefined)}
        placeholder="https://..."
      />
      <TextField
        label="Width"
        value={block.width || ''}
        onChange={(width) => block.updateStyle('width', width || undefined)}
        placeholder="auto or 300px"
      />
      <TextField
        label="Border Radius"
        value={block.borderRadius || ''}
        onChange={(br) => block.updateStyle('borderRadius', br || undefined)}
        placeholder="0px"
      />
      <AlignmentField
        value={block.align || 'center'}
        onChange={(align) => block.updateStyle('align', align)}
      />
    </>
  );
});

const ButtonBlockProperties = observer(function ButtonBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  const themeColors = useThemeColors();
  return (
    <>
      <TextField
        label="Button Text"
        value={block.label || ''}
        onChange={(label) => block.updateStyle('label', label)}
        placeholder="Click here"
      />
      <TextField
        label="Link URL"
        value={block.href || ''}
        onChange={(href) => block.updateStyle('href', href)}
        placeholder="https://..."
      />
      <ColorField
        label="Background Color"
        value={block.backgroundColor || '#1a73e8'}
        onChange={(color) => block.updateStyle('backgroundColor', color)}
        themeColors={themeColors}
      />
      <ColorField
        label="Text Color"
        value={block.color || '#ffffff'}
        onChange={(color) => block.updateStyle('color', color)}
        themeColors={themeColors}
      />
      <TextField
        label="Border Radius"
        value={block.borderRadius || '4px'}
        onChange={(br) => block.updateStyle('borderRadius', br)}
        placeholder="4px"
      />
      <AlignmentField
        value={block.align || 'center'}
        onChange={(align) => block.updateStyle('align', align)}
      />
    </>
  );
});

const DividerBlockProperties = observer(function DividerBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  const themeColors = useThemeColors();
  return (
    <>
      <ColorField
        label="Line Color"
        value={block.borderColor || '#e5e7eb'}
        onChange={(color) => block.updateStyle('borderColor', color)}
        themeColors={themeColors}
      />
      <TextField
        label="Line Width"
        value={block.borderWidth || '1px'}
        onChange={(width) => block.updateStyle('borderWidth', width)}
        placeholder="1px"
      />
      <SelectField
        label="Line Style"
        value={block.borderStyle || 'solid'}
        options={['solid', 'dashed', 'dotted']}
        onChange={(style) => block.updateStyle('borderStyle', style)}
      />
      <TextField
        label="Width"
        value={block.width || '100%'}
        onChange={(width) => block.updateStyle('width', width)}
        placeholder="100%"
      />
    </>
  );
});

const SpacerBlockProperties = observer(function SpacerBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  return (
    <TextField
      label="Height"
      value={block.height || '20px'}
      onChange={(height) => block.updateStyle('height', height)}
      placeholder="20px"
    />
  );
});

const SocialBlockProperties = observer(function SocialBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  return (
    <>
      <TextField
        label="Icon Size"
        value={block.iconSize || '32px'}
        onChange={(size) => block.updateStyle('iconSize', size)}
        placeholder="32px"
      />
      <SelectField
        label="Layout"
        value={block.mode || 'horizontal'}
        options={['horizontal', 'vertical']}
        onChange={(mode) => block.updateStyle('mode', mode)}
      />
      <AlignmentField
        value={block.align || 'center'}
        onChange={(align) => block.updateStyle('align', align)}
      />
    </>
  );
});

const HeroBlockProperties = observer(function HeroBlockProperties({
  block,
}: {
  block: BlockInstance;
}) {
  const themeColors = useThemeColors();
  return (
    <>
      <TextField
        label="Background Image"
        value={block.backgroundImage || ''}
        onChange={(url) => block.updateStyle('backgroundImage', url)}
        placeholder="https://..."
      />
      <ColorField
        label="Background Color"
        value={block.backgroundColor || '#f3f4f6'}
        onChange={(color) => block.updateStyle('backgroundColor', color)}
        themeColors={themeColors}
      />
      <TextField
        label="Height"
        value={block.backgroundHeight || '300px'}
        onChange={(h) => block.updateStyle('backgroundHeight', h)}
        placeholder="300px"
      />
      <SelectField
        label="Vertical Align"
        value={block.verticalAlign || 'middle'}
        options={['top', 'middle', 'bottom']}
        onChange={(va) => block.updateStyle('verticalAlign', va)}
      />
    </>
  );
});
