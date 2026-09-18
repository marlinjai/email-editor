import { describe, expect, it } from 'vitest';
import { createTestClient, jsonResponse } from './test-helpers';

describe('multipart routes', () => {
  it('uploads an asset as multipart/form-data with the file field named "file"', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));

    const file = new Blob(['fake image bytes'], { type: 'image/png' });
    await client.assets.upload(file, 'logo.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/assets');
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBeInstanceOf(Blob);
    // fetch sets the multipart boundary itself; the SDK must not set content-type.
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.has('content-type')).toBe(false);
  });

  it('uploads a CSV import as the "file" field only; the mapping is a later step', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));

    const csv = new Blob(['email\na@example.com\n'], { type: 'text/csv' });
    await client.imports.create(csv, 'people.csv');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://mail.test.internal/v1/imports');
    const body = (init as RequestInit).body as FormData;
    expect(body.get('file')).toBeInstanceOf(Blob);
    expect((body.get('file') as File).name).toBe('people.csv');
    expect(body.get('options')).toBeNull();
  });

  it('mints and reuses an Idempotency-Key across a retried multipart upload', async () => {
    const { client, fetchMock } = createTestClient({ validateResponses: false });
    fetchMock
      .mockResolvedValueOnce(new Response('gateway error', { status: 502 }))
      .mockResolvedValueOnce(jsonResponse(201, {}));

    await client.assets.upload(new Blob(['x']), 'x.png');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const key1 = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers).get('idempotency-key');
    const key2 = new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers).get('idempotency-key');
    expect(key1).toBeTruthy();
    expect(key1).toBe(key2);
  });
});
