import { EXPORT_WARNINGS_HEADER, EXPORT_WARNING_COUNT_HEADER, formatExportWarningsHeader } from '@marlinjai/mail-contract';
import { describe, expect, it } from 'vitest';
import { MailApiError } from '../errors';
import { dispositionFilename } from '../core';
import { createTestClient, errorResponse, jsonResponse } from './test-helpers';

const fileResponse = (content: string, headers: Record<string, string>) => new Response(content, { status: 200, headers });

describe('templates.export and mailings.export return the file', () => {
  it('reads the text, the content type, the file name and the warnings', async () => {
    const { client, fetchMock } = createTestClient();
    const warnings = [{ message: '<img src>: "https://x.de/a.png" loads from x.de', path: '<img src>' }];
    fetchMock.mockResolvedValueOnce(
      fileResponse('<!doctype html><p>Hi</p>', {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="Herbst.html"; filename*=UTF-8''Herbst.html`,
        [EXPORT_WARNINGS_HEADER]: formatExportWarningsHeader(warnings),
        [EXPORT_WARNING_COUNT_HEADER]: '3',
        'x-request-id': 'req_1',
      }),
    );
    const file = await client.templates.export('tpl_1', { format: 'html', version: 2 });
    expect(file).toEqual({
      content: '<!doctype html><p>Hi</p>',
      contentType: 'text/html; charset=utf-8',
      filename: 'Herbst.html',
      warnings,
      warningCount: 3,
      requestId: 'req_1',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/templates/tpl_1/export?format=html&version=2');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit & { headers: Record<string, string> }).headers['idempotency-key']).toBeUndefined();
  });

  it('a mailing export, without warnings', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(fileResponse('<mjml></mjml>', { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="m.mjml"' }));
    const file = await client.mailings.export('mlg_1', { format: 'mjml' });
    expect(file).toMatchObject({ content: '<mjml></mjml>', filename: 'm.mjml', warnings: [], warningCount: 0 });
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://mail.test.internal/v1/mailings/mlg_1/export?format=mjml');
  });

  it('an error is still the JSON envelope, and a 503 is retried', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(errorResponse(503, 'service_unavailable'));
    fetchMock.mockResolvedValueOnce(fileResponse('x', { 'content-type': 'text/plain' }));
    expect((await client.templates.export('tpl_1', { format: 'mjml' })).content).toBe('x');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(errorResponse(404, 'not_found', 'No such template in this workspace.'));
    const err = await client.templates.export('tpl_2', { format: 'mjml' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailApiError);
    expect((err as MailApiError).code).toBe('not_found');
  });

  it('client.request on a file route answers with its text', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(fileResponse('<mjml/>', { 'content-type': 'text/plain' }));
    expect(await client.request('mailings.export', { params: { id: 'm' }, query: { format: 'mjml' } })).toBe('<mjml/>');
  });
});

describe('templates.import and importPreview', () => {
  it('posts the MJML with an idempotency key reused across retries', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(errorResponse(503, 'service_unavailable'));
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { template: {}, warnings: [], imported_assets: [] }));
    await client.templates.import({ name: 'N', mjml: '<mjml><mj-body></mj-body></mjml>' }, { idempotencyKey: 'k-1' });
    const keys = fetchMock.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['idempotency-key']);
    expect(keys).toEqual(['k-1', 'k-1']);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://mail.test.internal/v1/templates/import');
  });

  it('an invalid_mjml refusal carries the line and column', async () => {
    const { client, fetchMock } = createTestClient();
    fetchMock.mockResolvedValueOnce(errorResponse(422, 'invalid_mjml', 'Line 3, column 5: ...', { reason: 'invalid_xml', line: 3, column: 5 }));
    const err = (await client.templates.importPreview({ mjml: '<mjml>' }).catch((e: unknown) => e)) as MailApiError;
    expect(err.code).toBe('invalid_mjml');
    expect(err.details).toEqual({ reason: 'invalid_xml', line: 3, column: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('dispositionFilename', () => {
  it('prefers the UTF-8 form and falls back to the plain one', () => {
    expect(dispositionFilename(`attachment; filename="a.html"; filename*=UTF-8''Gr%C3%BC%C3%9Fe.html`)).toBe('Grüße.html');
    expect(dispositionFilename('attachment; filename="a b.mjml"')).toBe('a b.mjml');
    expect(dispositionFilename('attachment; filename=plain.mjml')).toBe('plain.mjml');
    expect(dispositionFilename(`attachment; filename*=UTF-8''%E0%A4%A; filename="ok.html"`)).toBe('ok.html');
    expect(dispositionFilename(null)).toBeNull();
    expect(dispositionFilename('inline')).toBeNull();
  });
});
