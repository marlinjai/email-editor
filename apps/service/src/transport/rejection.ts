/**
 * What a permanent SMTP rejection says about who is at fault.
 *
 * - `recipient`: the address itself is dead (no such mailbox, disabled mailbox,
 *   bad address). Sending to it again can only hurt the sender's reputation, so
 *   the worker suppresses it for every topic (a hard bounce).
 * - `sender`: the receiving server or the relay refused the sender, not the
 *   address: authentication, relaying, content or reputation policy, rate
 *   limits (5.7.x), or a bad sender address (5.1.7, 5.1.8). The recipient is not
 *   suppressed; the rejection is counted on the provider for the dashboard.
 * - `unknown`: anything else (mailbox full, message too large, a routing or
 *   protocol error, a reply that names no cause). The message is marked failed
 *   and nothing else changes. When in doubt, this: a false hard bounce blocks a
 *   real person for good, a missed one only costs a later retry.
 */
export type RejectionClass = 'recipient' | 'sender' | 'unknown';

export type ParsedReply = {
  /** The basic reply code (RFC 5321), e.g. 550. */
  code: number | null;
  /** The enhanced status code (RFC 3463), e.g. "5.1.1". */
  enhanced: { cls: number; subject: number; detail: number } | null;
};

/** A reply code at the start of the text or of a line, as in "550 ..." or "550-5.1.1 ...". */
const BASIC = /(?:^|[\s:])([245]\d\d)(?=[\s-]|$)/;
/** An enhanced status code on its own, as in "5.1.1" or "#5.1.10". */
const ENHANCED = /(?:^|[\s#(\-:])([245])\.(\d{1,3})\.(\d{1,3})(?=$|[\s),;:.\]])/;

/** Pulls the reply code and the enhanced status code out of an SMTP reply text. */
export function parseSmtpReply(code: number | null, text: string): ParsedReply {
  const basic = code ?? (BASIC.exec(text) ? Number(BASIC.exec(text)![1]) : null);
  const m = ENHANCED.exec(text);
  const enhanced = m ? { cls: Number(m[1]), subject: Number(m[2]), detail: Number(m[3]) } : null;
  return { code: basic, enhanced };
}

/**
 * Wording that clearly names the recipient's mailbox as the cause. Not
 * "mailbox unavailable": it is RFC 5321's stock text for any 550, which servers
 * also send for policy blocks.
 */
const RECIPIENT_TEXT = new RegExp(
  [
    String.raw`no such (user|mailbox|recipient|address|account)`,
    String.raw`(user|mailbox|recipient|address|account)( name)? (is )?(unknown|not found|does not exist|doesn'?t exist|not exist|invalid|disabled|inactive)`,
    String.raw`unknown (user|mailbox|recipient|address|account)`,
    String.raw`(user|mailbox|recipient|account) (has been )?(disabled|deactivated|suspended|deleted)`,
    String.raw`invalid (recipient|mailbox|address)`,
    String.raw`recipient address rejected: (user unknown|unknown|invalid)`,
    String.raw`address (is )?(not|no longer) (valid|in use|available)`,
    String.raw`(email )?account that you tried to reach (does not exist|is disabled)`,
  ].join('|'),
  'i',
);

/**
 * Wording inside a 5.1.x reply that names the sender's address or the setup:
 * such a reply is the sender's problem even though its status code is an
 * address code, whatever else it says.
 */
const SETUP_TEXT =
  /sender|from address|from: address|mail from|not one of your addresses|authenticat|not authori[sz]ed|not permitted to send|spf|dkim|dmarc/i;

/**
 * Wording that names the recipient's mailbox specifically. Inside 5.1.x it wins
 * over the generic word "relay", which Postfix also uses for its "relay
 * recipient table" of known mailboxes.
 */
const MAILBOX_TEXT = new RegExp(
  [RECIPIENT_TEXT.source, String.raw`recipient address rejected`, String.raw`mailbox unavailable`, String.raw`user unknown`].join('|'),
  'i',
);

/** "Relay access denied" and the like: the server will not relay for this sender. */
const RELAY_TEXT = /relay/i;

/** Wording that points at the sender, the content or a policy instead. */
const SENDER_TEXT =
  /spam|block(ed|list)|blacklist|denylist|policy|reputation|relay(ing)? (denied|not permitted|access denied)|authenticat|spf|dkim|dmarc|rate limit|too many|access denied|not authori[sz]ed|sender/i;

/**
 * Classifies a permanent rejection from an SMTP server. Pure: the table in
 * test/unit/rejection.test.ts is its specification.
 *
 * The enhanced status code decides when there is one: 5.1.x is an address
 * problem, except 5.1.7 and 5.1.8 (the sender's address) and any 5.1.x whose
 * text names the sender or the setup; 5.1.0 and 5.1.2 count only when the text
 * names the recipient's mailbox. 5.2.1 is a disabled mailbox, 5.7.x is policy. Without one, a classic 550, 551 or 553
 * reply counts as a hard bounce only when its text clearly names the recipient,
 * and as the sender's problem when its text names a policy.
 */
export function classifyRejection(code: number | null, text: string): RejectionClass {
  const reply = parseSmtpReply(code, text);
  if (reply.code === 530 || reply.code === 535 || reply.code === 534) return 'sender';
  const e = reply.enhanced;
  if (e && e.cls === 5) {
    if (e.subject === 1) {
      if (e.detail === 7 || e.detail === 8 || SETUP_TEXT.test(text)) return 'sender';
      // A phrase naming the mailbox wins over the generic "relay".
      if (MAILBOX_TEXT.test(text)) return 'recipient';
      if (RELAY_TEXT.test(text)) return 'sender';
      // 5.1.0 (other address status) and 5.1.2 (bad destination system) do not
      // say the mailbox is gone: only the text can.
      if (e.detail === 0 || e.detail === 2) return 'unknown';
      return 'recipient';
    }
    if (e.subject === 2 && e.detail === 1) return SETUP_TEXT.test(text) ? 'sender' : 'recipient';
    if (e.subject === 2) return 'unknown';
    if (e.subject === 7) return 'sender';
    return 'unknown';
  }
  if (e && e.cls !== 5) return 'unknown';
  if (reply.code === 550 || reply.code === 551 || reply.code === 553 || reply.code === 554) {
    // A policy word wins over a recipient word ("recipient rejected: spam").
    if (SENDER_TEXT.test(text)) return 'sender';
    if (reply.code !== 554 && RECIPIENT_TEXT.test(text)) return 'recipient';
  }
  return 'unknown';
}

/**
 * What the worker does about a permanent rejection, by the provider's kind:
 * `suppress` the recipient (a hard bounce), `count` it against the provider
 * (the sender's problem), or `none` (the message is failed, nothing else).
 *
 * - SMTP replies are classified by `classifyRejection`.
 * - Resend answers over HTTP, so its code is an HTTP status, never an SMTP
 *   reply: 401 and 403 (a refused key, an unverified domain) are the sender's
 *   problem; nothing Resend answers synchronously is a hard bounce. Its bounces
 *   arrive as events instead.
 * - A rejection before anything was handed over (no transport could be built:
 *   a missing credential or sealing key) is the sender's problem too.
 */
export type RejectionAction = 'suppress' | 'count' | 'none';

export function rejectionAction(
  kind: 'smtp' | 'resend',
  error: { code: number | null; message: string },
  handedOver: boolean,
): RejectionAction {
  if (!handedOver) return 'count';
  if (kind === 'resend') return error.code === 401 || error.code === 403 ? 'count' : 'none';
  const cls = classifyRejection(error.code, error.message);
  return cls === 'recipient' ? 'suppress' : cls === 'sender' ? 'count' : 'none';
}

/**
 * A rejection's reply text reduced to what repeats across recipients: lower
 * case, addresses and angle-bracketed tokens and long numbers removed,
 * whitespace collapsed. Five recipients refused with the same signature in a row
 * look like one cause, not five dead mailboxes.
 */
export function rejectionSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\s<>()\[\];,"']+@[^\s<>()\[\];,"']+/g, ' ')
    .replace(/\b[0-9a-f]{8,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}
