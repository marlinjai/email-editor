// packages/ui/src/inspector/properties/ImageSourceField.tsx
// Image source control: the host's picker when it supplies one, a URL field otherwise

import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ImageIcon, Loader2 } from 'lucide-react';
import type { BlockInstance } from '@marlinjai/email-editor-core';
import { useStore } from '../../store';
import { useEditorHost } from '../../host/EditorHostContext';
import { TextField } from '../fields';

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The image could not be loaded. Try again.';
}

export const ImageSourceField = observer(function ImageSourceField({ block }: { block: BlockInstance }) {
  const { onRequestImage } = useEditorHost();
  const { template } = useStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A different block in the same inspector slot starts with a clean state.
  useEffect(() => {
    setError(null);
    setPending(false);
  }, [block.id]);

  if (!onRequestImage) {
    return (
      <TextField
        label="Image URL"
        value={block.src || ''}
        onChange={(src) => block.updateStyle('src', src)}
        placeholder="https://..."
      />
    );
  }

  const requestImage = async () => {
    const blockId = block.id;
    setError(null);
    setPending(true);
    try {
      const result = await onRequestImage({
        blockId,
        blockType: block.type,
        currentUrl: block.src || undefined,
        currentAlt: block.alt || undefined,
      });
      if (result === null || result === undefined) return; // cancelled: leave the block as it is
      const url = typeof result.url === 'string' ? result.url.trim() : '';
      if (!url) {
        throw new Error('The image picker returned no image URL.');
      }
      // The user may have selected another block (or deleted this one) while
      // the picker was open: write to the block the request was made for, and
      // only if it is still in the document.
      const target = template.findBlockById(blockId);
      if (!target) return;
      const updates: Record<string, string> = { src: url };
      if (typeof result.alt === 'string') updates.alt = result.alt;
      target.updateProperties(updates);
    } catch (err) {
      if (mounted.current) setError(describeError(err));
    } finally {
      if (mounted.current) setPending(false);
    }
  };

  return (
    <div>
      <span className="block text-xs font-medium text-gray-600 mb-1">Image</span>
      {block.src ? (
        <p className="mb-2 text-xs text-gray-500 truncate" title={block.src}>
          {block.src}
        </p>
      ) : (
        <p className="mb-2 text-xs text-gray-500">No image chosen yet.</p>
      )}
      <button
        type="button"
        onClick={requestImage}
        disabled={pending}
        aria-busy={pending}
        className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
        {pending ? 'Waiting for image...' : block.src ? 'Replace image' : 'Choose image'}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});
