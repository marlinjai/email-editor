/**
 * Inject a 1x1 transparent tracking pixel before the closing </body> tag.
 */
export function injectTrackingPixel(
  html: string,
  campaignId: string,
  contactId: string,
  trackingBaseUrl: string,
): string {
  const pixelUrl = `${trackingBaseUrl}/track/open?cid=${encodeURIComponent(campaignId)}&rid=${encodeURIComponent(contactId)}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;

  // Insert before </body> if present, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Rewrite all <a href="..."> links for click tracking.
 * Each link is replaced with a redirect through the tracking endpoint.
 */
export function rewriteLinksForTracking(
  html: string,
  campaignId: string,
  contactId: string,
  trackingBaseUrl: string,
): string {
  // Match href="..." in anchor tags, but skip mailto:, tel:, and tracking URLs
  return html.replace(
    /(<a\b[^>]*\bhref=")([^"]+)("[^>]*>)/gi,
    (_match, prefix: string, url: string, suffix: string) => {
      // Skip non-http links, anchors, and already-tracked URLs
      if (
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('#') ||
        url.startsWith(trackingBaseUrl)
      ) {
        return `${prefix}${url}${suffix}`;
      }

      const trackedUrl = `${trackingBaseUrl}/track/click?cid=${encodeURIComponent(campaignId)}&rid=${encodeURIComponent(contactId)}&url=${encodeURIComponent(url)}`;
      return `${prefix}${trackedUrl}${suffix}`;
    },
  );
}
