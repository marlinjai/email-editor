'use client';

import { useId, useRef, useState } from 'react';
import type { ImageRequest, RequestedImage } from '@marlinjai/email-editor/react';
import { ASSET_CONTENT_TYPES, MAX_ASSET_BYTES } from '@marlinjai/mail-contract';
import { Dialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Button, Field, Input } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatBytes } from '@/lib/format';
import { uploadImage } from '../actions';

export type PendingImage = {
  request: ImageRequest;
  resolve: (image: RequestedImage | null) => void;
};

/**
 * The editor's image picker (its `onRequestImage` hook): upload a file to the
 * workspace's assets, which answers with a permanent URL safe for email, or
 * paste the URL of an image hosted elsewhere. Cancelling leaves the block as
 * it was.
 */
export function ImageDialog({ ws, pending, onDone }: { ws: string; pending: PendingImage | null; onDone: () => void }) {
  const { run, pending: uploading, error } = useAction();
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const altId = useId();
  const urlId = useId();
  const fileId = useId();

  const reset = () => {
    setUrl('');
    setAlt('');
    setFile(null);
    setLocalError(null);
  };
  const finish = (image: RequestedImage | null) => {
    pending?.resolve(image);
    reset();
    onDone();
  };

  return (
    <Dialog
      open={pending !== null}
      onClose={() => !uploading && finish(null)}
      title="Choose an image"
      description="Upload a PNG, JPEG, GIF or WebP up to 10 MB, or use the URL of an image that is already online."
      width="max-w-[520px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(null)} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={uploading}
            disabled={!file && url.trim() === ''}
            onClick={() => {
              setLocalError(null);
              if (file) {
                const form = new FormData();
                form.append('file', file);
                void run(
                  () => uploadImage(ws, form),
                  (asset) => finish({ url: asset.url, alt: alt.trim() || undefined }),
                );
                return;
              }
              const trimmed = url.trim();
              if (!/^https:\/\//i.test(trimmed)) {
                setLocalError('Use an https:// address: mail clients refuse or warn about plain http images.');
                return;
              }
              finish({ url: trimmed, alt: alt.trim() || undefined });
            }}
          >
            {file ? 'Upload and use' : 'Use image'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="text-[12.5px] font-medium text-muted">
            Upload
          </label>
          <input
            ref={fileInput}
            id={fileId}
            type="file"
            accept={ASSET_CONTENT_TYPES.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setLocalError(null);
              if (f && f.size > MAX_ASSET_BYTES) {
                setLocalError(`That file is ${formatBytes(f.size)}; the limit is ${formatBytes(MAX_ASSET_BYTES)}.`);
                e.target.value = '';
                setFile(null);
                return;
              }
              setFile(f);
              if (f) setUrl('');
            }}
            className="text-[13px] text-muted file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-raised file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
          />
        </div>
        <Field id={urlId} label="Or an image URL">
          <Input
            id={urlId}
            type="url"
            placeholder="https://"
            value={url}
            disabled={file !== null}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field id={altId} label="Alt text" hint="Read aloud by screen readers and shown when images are blocked.">
          <Input id={altId} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={pending?.request.currentAlt ?? ''} />
        </Field>
        {localError ? (
          <p role="alert" className="text-[13px] text-danger">
            {localError}
          </p>
        ) : null}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
