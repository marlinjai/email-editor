import type { ContactStorageAdapter } from './types';

/**
 * Configuration for the unsubscribe manager.
 */
export interface UnsubscribeConfig {
  /** Base URL for unsubscribe links (e.g. "https://app.example.com/unsubscribe") */
  baseUrl: string;
  /** Secret key for signing unsubscribe tokens */
  secret: string;
}

/**
 * Generate a signed unsubscribe token for a contact.
 * Uses a simple HMAC-like approach with the contact ID and secret.
 */
export function generateUnsubscribeToken(contactId: string, secret: string): string {
  // Simple token: base64(contactId:timestamp:signature)
  const timestamp = Date.now().toString(36);
  const payload = `${contactId}:${timestamp}`;
  const signature = simpleHash(payload + secret);
  return btoa(`${payload}:${signature}`);
}

/**
 * Verify and decode an unsubscribe token.
 * Returns the contact ID if valid, null if invalid.
 */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000, // 30 days
): string | null {
  try {
    const decoded = atob(token);
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;

    const [contactId, timestamp, signature] = parts as [string, string, string];
    const payload = `${contactId}:${timestamp}`;
    const expectedSig = simpleHash(payload + secret);

    if (signature !== expectedSig) return null;

    // Check expiry
    const tokenTime = parseInt(timestamp, 36);
    if (maxAgeMs <= 0 || Date.now() - tokenTime > maxAgeMs) return null;

    return contactId;
  } catch {
    return null;
  }
}

/**
 * Generate a full unsubscribe URL for a contact.
 */
export function generateUnsubscribeUrl(contactId: string, config: UnsubscribeConfig): string {
  const token = generateUnsubscribeToken(contactId, config.secret);
  const url = new URL(config.baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Process an unsubscribe request using a token.
 * Verifies the token, updates the contact status, and records the unsubscribe event.
 */
export async function processUnsubscribe(
  token: string,
  adapter: ContactStorageAdapter,
  config: UnsubscribeConfig,
  reason?: string,
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  const contactId = verifyUnsubscribeToken(token, config.secret);
  if (!contactId) {
    return { success: false, error: 'Invalid or expired unsubscribe token' };
  }

  const contact = await adapter.getContact(contactId);
  if (!contact) {
    return { success: false, error: 'Contact not found' };
  }

  if (contact.status === 'unsubscribed') {
    return { success: true, contactId };
  }

  await adapter.updateContact(contactId, { status: 'unsubscribed' });
  await adapter.recordUnsubscribe(contactId, reason, 'link');

  return { success: true, contactId };
}

/**
 * Check if a contact is eligible to receive emails.
 * Returns true only if the contact status is 'active'.
 */
export function canReceiveEmail(status: string): boolean {
  return status === 'active';
}

/**
 * Generate RFC 8058 List-Unsubscribe header values.
 * These headers enable one-click unsubscribe in email clients.
 */
export function generateListUnsubscribeHeaders(
  contactId: string,
  config: UnsubscribeConfig,
): { 'List-Unsubscribe': string; 'List-Unsubscribe-Post': string } {
  const url = generateUnsubscribeUrl(contactId, config);
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Simple hash function for token signing.
 * Not cryptographically secure — in production, use Web Crypto API HMAC.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
