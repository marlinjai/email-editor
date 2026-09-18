'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button, Field } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { formatBytes } from '@/lib/format';
import { uploadImport } from './actions';

/** Step one: the file. Nothing is written to contacts until the dry run was reviewed and committed. */
export function UploadForm({ ws }: { ws: string }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        const form = new FormData();
        form.set('file', file);
        void run(() => uploadImport(ws, form), ({ id }) => router.push(`/w/${ws}/contacts/imports/${id}`));
      }}
    >
      <Field id="imp-file" label="CSV file" hint="Up to 50 MB and 200,000 rows, with a header row. Comma or semicolon separated, UTF-8." error={fields.file} className="min-w-[280px]">
        <input
          ref={input}
          id="imp-file"
          type="file"
          accept=".csv,text/csv"
          aria-describedby="imp-file-hint"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-[13px] text-muted file:mr-3 file:h-9 file:rounded-lg file:border file:border-line-strong file:bg-raised file:px-3 file:text-[13px] file:font-semibold file:text-ink"
        />
      </Field>
      <Button type="submit" variant="primary" busy={pending} disabled={!file}>
        {pending ? 'Uploading' : 'Upload and map'}
      </Button>
      {file ? <span className="pb-2 text-[12.5px] text-faint">{formatBytes(file.size)}</span> : null}
      <div className="basis-full">
        <FormError error={error && !error.fields ? error : null} />
      </div>
    </form>
  );
}
