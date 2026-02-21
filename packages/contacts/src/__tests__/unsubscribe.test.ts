import { describe, it, expect, vi } from 'vitest';
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateUnsubscribeUrl,
  processUnsubscribe,
  canReceiveEmail,
  generateListUnsubscribeHeaders,
} from '../unsubscribe';
import type { ContactStorageAdapter, Contact } from '../types';

const TEST_SECRET = 'test-secret-key-123';

describe('generateUnsubscribeToken / verifyUnsubscribeToken', () => {
  it('should generate a token that can be verified', () => {
    const token = generateUnsubscribeToken('contact-1', TEST_SECRET);
    const result = verifyUnsubscribeToken(token, TEST_SECRET);
    expect(result).toBe('contact-1');
  });

  it('should reject token with wrong secret', () => {
    const token = generateUnsubscribeToken('contact-1', TEST_SECRET);
    const result = verifyUnsubscribeToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });

  it('should reject malformed tokens', () => {
    expect(verifyUnsubscribeToken('not-a-token', TEST_SECRET)).toBeNull();
    expect(verifyUnsubscribeToken('', TEST_SECRET)).toBeNull();
  });

  it('should reject expired tokens', () => {
    const token = generateUnsubscribeToken('contact-1', TEST_SECRET);
    // maxAgeMs of 0 means immediately expired
    const result = verifyUnsubscribeToken(token, TEST_SECRET, 0);
    expect(result).toBeNull();
  });
});

describe('generateUnsubscribeUrl', () => {
  it('should generate a valid URL with token', () => {
    const url = generateUnsubscribeUrl('contact-1', {
      baseUrl: 'https://app.example.com/unsubscribe',
      secret: TEST_SECRET,
    });
    expect(url).toContain('https://app.example.com/unsubscribe');
    expect(url).toContain('token=');
  });
});

describe('processUnsubscribe', () => {
  function createMockAdapter(contact?: Contact | null): ContactStorageAdapter {
    const defaultContact: Contact = {
      id: 'contact-1',
      email: 'john@test.com',
      status: 'active',
      tags: [],
      customFields: {},
      createdAt: '',
      updatedAt: '',
    };
    const resolvedContact = arguments.length > 0 ? contact : defaultContact;
    return {
      createContact: vi.fn(),
      getContact: vi.fn().mockResolvedValue(resolvedContact),
      getContactByEmail: vi.fn(),
      listContacts: vi.fn(),
      updateContact: vi.fn().mockResolvedValue({}),
      deleteContact: vi.fn(),
      bulkCreateContacts: vi.fn(),
      createSegment: vi.fn(),
      listSegments: vi.fn(),
      getSegmentContacts: vi.fn(),
      deleteSegment: vi.fn(),
      recordUnsubscribe: vi.fn().mockResolvedValue(undefined),
      isUnsubscribed: vi.fn(),
    };
  }

  it('should process valid unsubscribe', async () => {
    const adapter = createMockAdapter();
    const token = generateUnsubscribeToken('contact-1', TEST_SECRET);
    const config = { baseUrl: 'https://example.com/unsub', secret: TEST_SECRET };

    const result = await processUnsubscribe(token, adapter, config, 'No longer interested');

    expect(result.success).toBe(true);
    expect(result.contactId).toBe('contact-1');
    expect(adapter.updateContact).toHaveBeenCalledWith('contact-1', { status: 'unsubscribed' });
    expect(adapter.recordUnsubscribe).toHaveBeenCalledWith('contact-1', 'No longer interested', 'link');
  });

  it('should reject invalid token', async () => {
    const adapter = createMockAdapter();
    const config = { baseUrl: 'https://example.com/unsub', secret: TEST_SECRET };

    const result = await processUnsubscribe('bad-token', adapter, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('should handle missing contact', async () => {
    const adapter = createMockAdapter(null);
    const token = generateUnsubscribeToken('contact-1', TEST_SECRET);
    const config = { baseUrl: 'https://example.com/unsub', secret: TEST_SECRET };

    const result = await processUnsubscribe(token, adapter, config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should succeed for already unsubscribed contact', async () => {
    const adapter = createMockAdapter({
      id: 'contact-1',
      email: 'john@test.com',
      status: 'unsubscribed',
      tags: [],
      customFields: {},
      createdAt: '',
      updatedAt: '',
    });
    const token = generateUnsubscribeToken('contact-1', TEST_SECRET);
    const config = { baseUrl: 'https://example.com/unsub', secret: TEST_SECRET };

    const result = await processUnsubscribe(token, adapter, config);

    expect(result.success).toBe(true);
    expect(adapter.updateContact).not.toHaveBeenCalled();
  });
});

describe('canReceiveEmail', () => {
  it('should return true for active status', () => {
    expect(canReceiveEmail('active')).toBe(true);
  });

  it('should return false for unsubscribed', () => {
    expect(canReceiveEmail('unsubscribed')).toBe(false);
  });

  it('should return false for bounced', () => {
    expect(canReceiveEmail('bounced')).toBe(false);
  });
});

describe('generateListUnsubscribeHeaders', () => {
  it('should return RFC 8058 compliant headers', () => {
    const headers = generateListUnsubscribeHeaders('contact-1', {
      baseUrl: 'https://app.example.com/unsubscribe',
      secret: TEST_SECRET,
    });

    expect(headers['List-Unsubscribe']).toMatch(/^<https:\/\/app\.example\.com\/unsubscribe\?token=.+>$/);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
