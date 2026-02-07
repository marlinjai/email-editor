// packages/core/src/api/watermark.ts
// Watermark injection for free tier compiles

/**
 * Watermark HTML to inject into free tier emails
 * Clean, professional design that's visible but not intrusive
 */
const WATERMARK_HTML = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-top: 1px solid #e9ecef;">
  <tr>
    <td align="center" style="padding: 16px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #6c757d;">
            Created with
            <a href="https://emaileditor.dev" target="_blank" style="color: #944923; text-decoration: none; font-weight: 500;">
              Email Editor
            </a>
            •
            <a href="https://emaileditor.dev/upgrade" target="_blank" style="color: #6c757d; text-decoration: underline;">
              Remove this watermark
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;

/**
 * Inject watermark into compiled HTML
 * Inserts before the closing </body> tag
 */
export function injectWatermark(html: string): string {
  // Find the closing body tag and inject watermark before it
  const bodyCloseIndex = html.lastIndexOf('</body>');
  
  if (bodyCloseIndex === -1) {
    // No body tag found, append to end
    return html + WATERMARK_HTML;
  }

  return (
    html.slice(0, bodyCloseIndex) +
    WATERMARK_HTML +
    html.slice(bodyCloseIndex)
  );
}

/**
 * Check if HTML already contains a watermark
 * (to prevent double-injection)
 */
export function hasWatermark(html: string): boolean {
  return html.includes('emaileditor.dev');
}

