import type { ProviderRow } from '../repo/providers.js';
import type { OutgoingMessage } from '../transport/index.js';
import { escapeHtml, listUnsubscribeHeaders, mergeHtml, mergeSubject, type MergeContext } from './merge.js';

/**
 * Inserts the preheader (the preview line inboxes show after the subject) as the
 * first thing in the body, hidden when the message is opened. Merge fields in it
 * are filled like everywhere else.
 */
function withPreheader(html: string, preheader: string | null): string {
  if (!preheader) return html;
  const hidden =
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">' +
    escapeHtml(preheader) +
    '</div>';
  const body = /<body[^>]*>/i.exec(html);
  if (!body) return hidden + html;
  const at = body.index + body[0].length;
  return html.slice(0, at) + hidden + html.slice(at);
}

/**
 * One recipient's message, exactly as it is handed to the provider and archived:
 * merge fields filled (every value HTML-escaped), the preheader in place, and the
 * List-Unsubscribe headers of RFC 8058 (one-click) pointing at this recipient's
 * hosted page, with the sender's reply address as the mailto alternative.
 */
export function composeMessage(input: {
  provider: Pick<ProviderRow, 'from_name' | 'from_email' | 'reply_to'>;
  subject: string;
  preheader: string | null;
  html: string;
  to: string;
  ctx: MergeContext;
  extraHeaders?: Record<string, string>;
}): OutgoingMessage {
  const { provider, ctx } = input;
  // The preheader goes in before merging, so its own merge fields are filled
  // (and escaped) once, with the body's.
  const html = mergeHtml(withPreheader(input.html, input.preheader), ctx);
  return {
    from: { name: provider.from_name, email: provider.from_email },
    to: [input.to],
    replyTo: provider.reply_to,
    subject: mergeSubject(input.subject, ctx),
    html,
    headers: {
      ...listUnsubscribeHeaders(ctx.unsubscribeUrl, provider.reply_to ?? provider.from_email),
      ...(input.extraHeaders ?? {}),
    },
  };
}
