// packages/ui/src/renderer/blocks/TextBlock.tsx
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { BlockInstance } from '@returnhypnosis/email-editor-core';
import { useStore } from '../../store';

interface TextBlockProps {
  block: BlockInstance;
}

/**
 * TextBlock - Renders a text block with inline WYSIWYG editing
 *
 * Key implementation details:
 * - Uses contenteditable for direct text editing when selected
 * - Does NOT use dangerouslySetInnerHTML when editing (causes cursor reset)
 * - Syncs content to MST only on blur (not on every keystroke)
 * - Stops keyboard event propagation to prevent block deletion on backspace
 */
export const TextBlock = observer(({ block }: TextBlockProps) => {
  const { editorUI } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const isSelected = editorUI.selectedBlockId === block.id;
  const [isEditing, setIsEditing] = useState(false);

  // Cast to React.CSSProperties for compatibility with React's style prop
  const style = block.computedStyle as React.CSSProperties;

  // Initialize content when mounting or when content changes externally (not while editing)
  useEffect(() => {
    if (ref.current && !isEditing) {
      ref.current.innerHTML = block.content || '<p>Click to edit...</p>';
    }
  }, [block.content, isEditing]);

  // Handle focus - start editing mode
  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  // Handle blur - sync content to MST and exit editing mode
  const handleBlur = useCallback(() => {
    if (ref.current) {
      const newContent = ref.current.innerHTML;
      if (newContent !== block.content) {
        block.setContent(newContent);
      }
    }
    setIsEditing(false);
  }, [block]);

  // Stop keyboard events from bubbling to prevent block deletion on backspace/delete
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Stop propagation for all editing keys to prevent parent handlers
    // from interpreting them as commands (e.g., delete block on Backspace)
    e.stopPropagation();
  }, []);

  // When clicking on the text block while selected, focus it for editing
  const handleClick = useCallback(() => {
    if (isSelected && ref.current) {
      ref.current.focus();
    }
  }, [isSelected]);

  return (
    <div
      ref={ref}
      className="text-block outline-none"
      contentEditable={isSelected}
      suppressContentEditableWarning
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      style={{
        ...style,
        minHeight: '1em',
        wordBreak: 'break-word',
        cursor: isSelected ? 'text' : 'pointer',
      }}
    />
  );
});

TextBlock.displayName = 'TextBlock';
