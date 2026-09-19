import { describe, expect, it } from 'vitest';
import { routes, acceptsIdempotencyKey, matchRoute, type RouteDef } from './routes';
import {
  EXPORT_CONTENT_TYPES,
  MAX_EXPORT_WARNINGS_HEADER_LENGTH,
  TemplateExportQuery,
  TemplateImport,
  TemplateImportPreviewRequest,
  exportFilename,
  formatExportWarningsHeader,
  parseExportWarningsHeader,
} from './templates';
import { ERROR_STATUS } from './errors';

describe('MJML import and export routes', () => {
  it('import is an idempotent write, the preview a read, exports are text GETs', () => {
    expect(routes['templates.import']).toMatchObject({ method: 'POST', path: '/v1/templates/import', status: 201, access: 'write' });
    expect(acceptsIdempotencyKey(routes['templates.import'] as RouteDef)).toBe(true);
    expect(routes['templates.importPreview']).toMatchObject({ method: 'POST', status: 200, access: 'read' });
    for (const id of ['templates.export', 'mailings.export'] as const) {
      expect(routes[id]).toMatchObject({ method: 'GET', responseType: 'text', access: 'read' });
      expect(acceptsIdempotencyKey(routes[id] as RouteDef)).toBe(false);
    }
  });

  it('the import paths are not read as a template id', () => {
    expect(matchRoute('POST', '/v1/templates/import')?.id).toBe('templates.import');
    expect(matchRoute('POST', '/v1/templates/import/preview')?.id).toBe('templates.importPreview');
    expect(matchRoute('GET', '/v1/templates/tpl_1/export')?.id).toBe('templates.export');
    expect(matchRoute('GET', '/v1/mailings/mlg_1/export')?.id).toBe('mailings.export');
  });

  it('invalid_mjml is a 422', () => {
    expect(ERROR_STATUS.invalid_mjml).toBe(422);
  });
});

describe('shapes', () => {
  it('an import needs a name and MJML', () => {
    expect(TemplateImport.safeParse({ name: 'N', mjml: '<mjml/>' }).success).toBe(true);
    expect(TemplateImport.safeParse({ name: 'N', mjml: '' }).success).toBe(false);
    expect(TemplateImport.safeParse({ name: '', mjml: '<mjml/>' }).success).toBe(false);
    expect(TemplateImport.safeParse({ name: 'N', mjml: '<mjml/>', import_remote_assets: 'yes' }).success).toBe(false);
    expect(TemplateImportPreviewRequest.safeParse({}).success).toBe(false);
  });

  it('an export names a format, and optionally a version', () => {
    expect(TemplateExportQuery.parse({ format: 'html', version: '3' })).toEqual({ format: 'html', version: 3 });
    expect(TemplateExportQuery.safeParse({ format: 'pdf' }).success).toBe(false);
    expect(TemplateExportQuery.safeParse({}).success).toBe(false);
    expect(TemplateExportQuery.safeParse({ format: 'mjml', version: '0' }).success).toBe(false);
    expect(EXPORT_CONTENT_TYPES.html).toMatch(/^text\/html/);
  });
});

describe('the export warnings header', () => {
  it('round-trips, and reads garbage as no warnings', () => {
    const messages = [{ message: 'mj-image: "https://x.de/a.png" loads from x.de', path: '<img src>' }, { message: 'ümlaut, "quotes", commas' }];
    expect(parseExportWarningsHeader(formatExportWarningsHeader(messages))).toEqual(messages);
    expect(parseExportWarningsHeader(null)).toEqual([]);
    expect(parseExportWarningsHeader('%E0%A4%A')).toEqual([]);
    expect(parseExportWarningsHeader(encodeURIComponent('{"no":1}'))).toEqual([]);
  });

  it('stays within its length and is plain ASCII', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ message: `address number ${i} is not allowed here` }));
    const value = formatExportWarningsHeader(many);
    expect(value.length).toBeLessThanOrEqual(MAX_EXPORT_WARNINGS_HEADER_LENGTH);
    expect(/^[\x21-\x7e]*$/.test(value)).toBe(true);
    const back = parseExportWarningsHeader(value);
    expect(back.length).toBeGreaterThan(10);
    expect(back[0]).toEqual(many[0]);
  });
});

describe('export file names', () => {
  it('reduce a name to a safe ASCII stem', () => {
    expect(exportFilename('Herbst-Newsletter 2026', 'html')).toBe('Herbst-Newsletter-2026.html');
    expect(exportFilename('Grüße aus Köln', 'mjml')).toBe('Grusse-aus-Koln.mjml');
    expect(exportFilename('../../etc/passwd', 'mjml')).toBe('etc-passwd.mjml');
    expect(exportFilename('"; x=1', 'html')).toBe('x-1.html');
    expect(exportFilename('日本語', 'html')).toBe('export.html');
    expect(exportFilename('a'.repeat(300), 'mjml')).toBe(`${'a'.repeat(80)}.mjml`);
  });
});
