// packages/ui/src/inspector/properties/BackgroundImageField.tsx
// A section's or wrapper's background image: the host's picker when it supplies one, a URL field otherwise

import React, { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { useEditorHost } from '../../host/EditorHostContext';
import { TextField } from '../fields';

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'The image could not be loaded. Try again.';
}

export interface BackgroundImageFieldProps {
  /** The id of the section or wrapper the image is for (passed to the host as `blockId`). */
  targetId: string;
  /** What the image is for, passed to the host as `blockType`. */
  targetType: 'section' | 'wrapper';
  value: string | undefined;
  /**
   * Writes the chosen URL. Called with the id the request was made for, so a
   * caller can check the target still exists (the user may have moved on).
   */
  onChange: (url: string | undefined, targetId: string) => void;
}

/**
 * Background image control. With the host's `onRequestImage`, a "Choose
 * image" button opens the host's picker (cancel leaves the image as it is, an
 * error shows inline); without it, a URL field.
 */
export function BackgroundImageField({ targetId, targetType, value, onChange }: BackgroundImageFieldProps) {
  const { onRequestImage } = useEditorHost();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const shownTarget = useRef(targetId);
  shownTarget.current = targetId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setError(null);
    setPending(false);
  }, [targetId]);

  if (!onRequestImage) {
    return (
      <TextField
        label="Image URL"
        value={value || ''}
        onChange={(url) => onChange(url || undefined, targetId)}
        placeholder="https://..."
      />
    );
  }

  const request = async () => {
    const id = targetId;
    setError(null);
    setPending(true);
    try {
      const result = await onRequestImage({ blockId: id, blockType: targetType, currentUrl: value || undefined });
      if (result === null || result === undefined) return;
      const url = typeof result.url === 'string' ? result.url.trim() : '';
      if (!url) throw new Error('The image picker returned no image URL.');
      onChange(url, id);
    } catch (err) {
      if (mounted.current && shownTarget.current === id) setError(describeError(err));
    } finally {
      if (mounted.current && shownTarget.current === id) setPending(false);
    }
  };

  return (
    <div>
      <span className="block text-xs font-medium text-gray-600 mb-1">Background image</span>
      {value ? (
        <p className="mb-2 text-xs text-gray-500 truncate" title={value}>
          {value}
        </p>
      ) : (
        <p className="mb-2 text-xs text-gray-500">No image chosen yet.</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={request}
          disabled={pending}
          aria-busy={pending}
          className="flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
          {pending ? 'Waiting for image...' : value ? 'Replace background image' : 'Choose background image'}
        </button>
        {value && !pending ? (
          <button
            type="button"
            onClick={() => onChange(undefined, targetId)}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-300 rounded"
          >
            Remove
          </button>
        ) : null}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
