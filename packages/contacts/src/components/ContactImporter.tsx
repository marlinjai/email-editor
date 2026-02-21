import React, { useState, useRef } from 'react';
import type { CSVFieldMapping, CSVImportResult, ContactStorageAdapter } from '../types';
import { parseCSV, detectDelimiter, suggestMappings, importCSV } from '../csv-importer';

export interface ContactImporterProps {
  adapter: ContactStorageAdapter;
  onComplete?: (result: CSVImportResult) => void;
  onCancel?: () => void;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export function ContactImporter({
  adapter,
  onComplete,
  onCancel,
}: ContactImporterProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [csvContent, setCsvContent] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<CSVFieldMapping>({ email: '' });
  const [result, setResult] = useState<CSVImportResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setCsvContent(content);

      const delimiter = detectDelimiter(content);
      const rows = parseCSV(content, delimiter);
      if (rows.length < 2) {
        setError('CSV must have at least a header row and one data row');
        return;
      }

      const csvHeaders = rows[0]!;
      setHeaders(csvHeaders);
      setPreviewRows(rows.slice(1, 6)); // Show first 5 data rows

      // Auto-suggest mappings
      const suggested = suggestMappings(csvHeaders);
      setMapping({
        email: suggested.email ?? '',
        firstName: suggested.firstName,
        lastName: suggested.lastName,
        tags: suggested.tags,
      });

      setStep('mapping');
    };
    reader.readAsText(file);
  };

  const handleMappingChange = (field: keyof CSVFieldMapping, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  };

  const proceedToPreview = () => {
    if (!mapping.email) {
      setError('Email mapping is required');
      return;
    }
    setError('');
    setStep('preview');
  };

  const startImport = async () => {
    setStep('importing');
    setError('');
    try {
      const importResult = await importCSV(csvContent, mapping, adapter);
      setResult(importResult);
      setStep('complete');
      onComplete?.(importResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload');
    setCsvContent('');
    setHeaders([]);
    setPreviewRows([]);
    setMapping({ email: '' });
    setResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="ec-contact-importer">
      {error && <div className="ec-contact-importer__error">{error}</div>}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="ec-contact-importer__upload">
          <h3>Import contacts from CSV</h3>
          <p>Upload a CSV file with your contacts. The first row should contain column headers.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="ec-contact-importer__file-input"
          />
          {onCancel && (
            <button onClick={onCancel} className="ec-contact-importer__cancel">
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && (
        <div className="ec-contact-importer__mapping">
          <h3>Map CSV columns to contact fields</h3>

          {(['email', 'firstName', 'lastName', 'tags'] as const).map((field) => (
            <label key={field} className="ec-contact-importer__mapping-field">
              <span>
                {field === 'email'
                  ? 'Email (required)'
                  : field === 'firstName'
                    ? 'First name'
                    : field === 'lastName'
                      ? 'Last name'
                      : 'Tags'}
              </span>
              <select
                value={mapping[field] ?? ''}
                onChange={(e) => handleMappingChange(field, e.target.value)}
              >
                <option value="">-- Not mapped --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <div className="ec-contact-importer__mapping-actions">
            <button onClick={proceedToPreview} className="ec-contact-importer__next">
              Next: Preview
            </button>
            <button onClick={reset} className="ec-contact-importer__back">
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="ec-contact-importer__preview">
          <h3>Preview import</h3>
          <p>
            {previewRows.length} row{previewRows.length !== 1 ? 's' : ''} shown (of{' '}
            {csvContent.split('\n').length - 1} total)
          </p>

          <table className="ec-contact-importer__preview-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ec-contact-importer__preview-actions">
            <button onClick={startImport} className="ec-contact-importer__import">
              Start import
            </button>
            <button onClick={() => setStep('mapping')} className="ec-contact-importer__back">
              Back to mapping
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {step === 'importing' && (
        <div className="ec-contact-importer__importing">
          <h3>Importing contacts...</h3>
          <p>Please wait while your contacts are being imported.</p>
        </div>
      )}

      {/* Step 5: Complete */}
      {step === 'complete' && result && (
        <div className="ec-contact-importer__complete">
          <h3>Import complete</h3>
          <dl>
            <dt>Total rows</dt>
            <dd>{result.total}</dd>
            <dt>Created</dt>
            <dd>{result.created}</dd>
            <dt>Updated</dt>
            <dd>{result.updated}</dd>
            <dt>Skipped</dt>
            <dd>{result.skipped}</dd>
          </dl>

          {result.errors.length > 0 && (
            <details className="ec-contact-importer__errors">
              <summary>{result.errors.length} error(s)</summary>
              <ul>
                {result.errors.map((err, i) => (
                  <li key={i}>
                    Row {err.row}: {err.error}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button onClick={reset} className="ec-contact-importer__reset">
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
