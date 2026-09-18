// examples/nextjs/app/editor/ImagePickerDialog.tsx
// A host-side image picker, answering the editor's onRequestImage hook.
// A real host would open its media library or an uploader here.

'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImageRequest, RequestedImage } from '@marlinjai/email-editor/react';

const SAMPLE_IMAGES: RequestedImage[] = [
  { url: 'https://picsum.photos/id/1015/1200/600', alt: 'River between mountains' },
  { url: 'https://picsum.photos/id/1043/1200/600', alt: 'Forest path' },
  { url: 'https://picsum.photos/id/1080/1200/600', alt: 'Strawberries on a table' },
];

export interface PendingImageRequest {
  request: ImageRequest;
  resolve: (image: RequestedImage | null) => void;
  reject: (error: Error) => void;
}

export function ImagePickerDialog({
  pending,
  onDone,
}: {
  pending: PendingImageRequest;
  onDone: () => void;
}) {
  const [url, setUrl] = useState(pending.request.currentUrl ?? '');
  const [alt, setAlt] = useState(pending.request.currentAlt ?? '');
  const dialogRef = useRef<HTMLDivElement>(null);

  const choose = (image: RequestedImage) => {
    pending.resolve(image);
    onDone();
  };
  const cancel = () => {
    pending.resolve(null);
    onDone();
  };
  const fail = () => {
    pending.reject(new Error('Upload failed: the file is larger than 5 MB (simulated).'));
    onDone();
  };

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trimmedUrl = url.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={cancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-picker-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-xl rounded-xl bg-white p-6 text-slate-900 shadow-2xl outline-none"
      >
        <h2 id="image-picker-title" className="text-lg font-semibold">
          Choose an image
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Your app's media library would appear here. Pick a sample, paste a URL, or try the failure path.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {SAMPLE_IMAGES.map((image) => (
            <button
              key={image.url}
              type="button"
              onClick={() => choose(image)}
              className="overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-2 hover:ring-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <img src={image.url} alt={image.alt} className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>

        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedUrl) choose({ url: trimmedUrl, alt: alt.trim() || undefined });
          }}
        >
          <label className="block text-sm font-medium" htmlFor="image-picker-url">
            Image URL
          </label>
          <input
            id="image-picker-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <label className="block text-sm font-medium" htmlFor="image-picker-alt">
            Alt text
          </label>
          <input
            id="image-picker-alt"
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="Describe the image"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center justify-between pt-3">
            <button type="button" onClick={fail} className="text-sm text-red-600 underline underline-offset-2">
              Simulate an upload failure
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={cancel} className="rounded-md px-3 py-2 text-sm ring-1 ring-slate-300">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!trimmedUrl}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Use this URL
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
