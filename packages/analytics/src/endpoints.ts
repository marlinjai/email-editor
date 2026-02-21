import type { AnalyticsTracker } from './tracker';

// 1x1 transparent GIF as a Uint8Array
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
  0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b,
]);

export interface TrackingEndpointRequest {
  campaignId: string;
  contactId: string;
  url?: string;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Handle a tracking pixel request (open tracking).
 * Returns a 1x1 transparent GIF with appropriate headers.
 */
export async function handleOpenTrack(
  tracker: AnalyticsTracker,
  request: TrackingEndpointRequest,
): Promise<{ body: Uint8Array; headers: Record<string, string>; status: number }> {
  // Record the open event asynchronously (don't block the pixel response)
  tracker.recordOpen(
    request.campaignId,
    request.contactId,
    request.userAgent,
    request.ipAddress,
  ).catch(() => {
    // Silently ignore errors to avoid breaking the pixel
  });

  return {
    body: TRANSPARENT_GIF,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    status: 200,
  };
}

/**
 * Handle a click tracking request.
 * Records the click event and returns a redirect response.
 */
export async function handleClickTrack(
  tracker: AnalyticsTracker,
  request: TrackingEndpointRequest,
): Promise<{ redirectUrl: string; headers: Record<string, string>; status: number }> {
  const redirectUrl = request.url || '/';

  // Record the click event asynchronously
  tracker.recordClick(
    request.campaignId,
    request.contactId,
    redirectUrl,
    request.userAgent,
    request.ipAddress,
  ).catch(() => {
    // Silently ignore errors to avoid breaking the redirect
  });

  return {
    redirectUrl,
    headers: {
      'Location': redirectUrl,
      'Cache-Control': 'no-store',
    },
    status: 302,
  };
}

/**
 * Parse tracking query parameters from a URL.
 */
export function parseTrackingParams(
  params: Record<string, string | undefined>,
): TrackingEndpointRequest | null {
  const campaignId = params.cid;
  const contactId = params.rid;

  if (!campaignId || !contactId) return null;

  return {
    campaignId,
    contactId,
    url: params.url ? decodeURIComponent(params.url) : undefined,
  };
}

/**
 * Get the transparent GIF bytes (for custom endpoint implementations).
 */
export function getTransparentGif(): Uint8Array {
  return TRANSPARENT_GIF;
}
