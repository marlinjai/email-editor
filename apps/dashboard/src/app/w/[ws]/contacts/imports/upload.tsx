'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button, describedBy, Field } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatBytes } from '@/lib/format';
import { uploadImport } from './actions';

/** Step one: the file. Nothing is written to contacts until the dry run was reviewed and committed. */
export function UploadForm({ ws }: { ws: string }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [missing, setMissing] = useState(false);
  const fileError = fields.file ?? (missing ? 'Choose a CSV file' : undefined);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        // Read from the input itself: a file chosen before the page finished
        // loading never reached the change handler.
        const chosen = input.current?.files?.[0] ?? null;
        setFile(chosen);
        setMissing(!chosen);
        if (!chosen) return;
        const form = new FormData();
        form.set('file', chosen);
        void run(() => uploadImport(ws, form), ({ id }) => router.push(`/w/${ws}/contacts/imports/${id}`));
      }}
    >
      <Field id="imp-file" label="CSV file" hint="Up to 50 MB and 200,000 rows, with a header row. Comma or semicolon separated, UTF-8." error={fileError} className="min-w-[280px]">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          {...describedBy('imp-file', fileError, true)}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMissing(false);
          }}
          className="block w-full text-[13px] text-muted file:mr-3 file:h-9 file:rounded-lg file:border file:border-line-strong file:bg-raised file:px-3 file:text-[13px] file:font-semibold file:text-ink"
        />
      </Field>
      <Button type="submit" variant="primary" busy={pending}>
        {pending ? 'Uploading' : 'Upload and map'}
      </Button>
      {file ? <span className="pb-2 text-[12.5px] text-faint">{formatBytes(file.size)}</span> : null}
      <div className="basis-full">
        <FormError error={error && !error.fields ? error : null} />
      </div>
    </form>
  );
}
