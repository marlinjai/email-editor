import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleOpenTrack, handleClickTrack, parseTrackingParams, getTransparentGif } from '../endpoints';
import type { AnalyticsTracker } from '../tracker';

describe('handleOpenTrack', () => {
  let tracker: AnalyticsTracker;

  beforeEach(() => {
    tracker = {
      recordOpen: vi.fn().mockResolvedValue({ id: 'evt1' }),
    } as unknown as AnalyticsTracker;
  });

  it('should return a 1x1 transparent GIF', async () => {
    const result = await handleOpenTrack(tracker, {
      campaignId: 'camp1',
      contactId: 'c1',
    });

    expect(result.status).toBe(200);
    expect(result.headers['Content-Type']).toBe('image/gif');
    expect(result.body).toBeInstanceOf(Uint8Array);
    expect(result.body.length).toBeGreaterThan(0);
    // GIF magic bytes
    expect(result.body[0]).toBe(0x47); // G
    expect(result.body[1]).toBe(0x49); // I
    expect(result.body[2]).toBe(0x46); // F
  });

  it('should set no-cache headers', async () => {
    const result = await handleOpenTrack(tracker, {
      campaignId: 'camp1',
      contactId: 'c1',
    });
    expect(result.headers['Cache-Control']).toContain('no-store');
  });

  it('should call recordOpen on tracker', async () => {
    await handleOpenTrack(tracker, {
      campaignId: 'camp1',
      contactId: 'c1',
      userAgent: 'Mozilla/5.0',
      ipAddress: '1.2.3.4',
    });

    // Give async operation time to execute
    await new Promise((r) => setTimeout(r, 10));

    expect(tracker.recordOpen).toHaveBeenCalledWith('camp1', 'c1', 'Mozilla/5.0', '1.2.3.4');
  });
});

describe('handleClickTrack', () => {
  let tracker: AnalyticsTracker;

  beforeEach(() => {
    tracker = {
      recordClick: vi.fn().mockResolvedValue({ id: 'evt1' }),
    } as unknown as AnalyticsTracker;
  });

  it('should return a 302 redirect', async () => {
    const result = await handleClickTrack(tracker, {
      campaignId: 'camp1',
      contactId: 'c1',
      url: 'https://example.com',
    });

    expect(result.status).toBe(302);
    expect(result.redirectUrl).toBe('https://example.com');
    expect(result.headers['Location']).toBe('https://example.com');
  });

  it('should default to "/" when no URL provided', async () => {
    const result = await handleClickTrack(tracker, {
      campaignId: 'camp1',
      contactId: 'c1',
    });

    expect(result.redirectUrl).toBe('/');
  });

  it('should call recordClick on tracker', async () => {
    await handleClickTrack(tracker, {
      campaignId: 'camp1',
      contactId: 'c1',
      url: 'https://example.com',
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(tracker.recordClick).toHaveBeenCalledWith(
      'camp1', 'c1', 'https://example.com', undefined, undefined,
    );
  });
});

describe('parseTrackingParams', () => {
  it('should parse valid params', () => {
    const result = parseTrackingParams({
      cid: 'camp1',
      rid: 'contact1',
      url: 'https%3A%2F%2Fexample.com',
    });

    expect(result).toEqual({
      campaignId: 'camp1',
      contactId: 'contact1',
      url: 'https://example.com',
    });
  });

  it('should return null for missing campaignId', () => {
    expect(parseTrackingParams({ rid: 'c1' })).toBeNull();
  });

  it('should return null for missing contactId', () => {
    expect(parseTrackingParams({ cid: 'camp1' })).toBeNull();
  });

  it('should handle missing url', () => {
    const result = parseTrackingParams({ cid: 'camp1', rid: 'c1' });
    expect(result?.url).toBeUndefined();
  });
});

describe('getTransparentGif', () => {
  it('should return valid GIF bytes', () => {
    const gif = getTransparentGif();
    expect(gif[0]).toBe(0x47);
    expect(gif[1]).toBe(0x49);
    expect(gif[2]).toBe(0x46);
  });
});
