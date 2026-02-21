import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResendSendAdapter } from '../index';

// Mock the Resend module
vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn(),
      },
    })),
  };
});

describe('ResendSendAdapter', () => {
  let adapter: ResendSendAdapter;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new ResendSendAdapter({ apiKey: 'test-api-key' });
    // Access the mocked send function
    mockSend = (adapter as unknown as { client: { emails: { send: ReturnType<typeof vi.fn> } } }).client.emails.send;
  });

  describe('send', () => {
    it('should send an email successfully', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'msg-123' },
        error: null,
      });

      const result = await adapter.send({
        to: 'recipient@example.com',
        from: { name: 'Sender', email: 'sender@example.com' },
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-123');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Sender <sender@example.com>',
          to: ['recipient@example.com'],
          subject: 'Test',
          html: '<p>Hello</p>',
        }),
      );
    });

    it('should handle Resend API errors', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key' },
      });

      const result = await adapter.send({
        to: 'recipient@example.com',
        from: { name: 'Sender', email: 'sender@example.com' },
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('should handle thrown exceptions', async () => {
      mockSend.mockRejectedValue(new Error('Network failure'));

      const result = await adapter.send({
        to: 'recipient@example.com',
        from: { name: 'Sender', email: 'sender@example.com' },
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    it('should pass reply_to and headers', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'msg-456' },
        error: null,
      });

      await adapter.send({
        to: 'recipient@example.com',
        from: { name: 'Sender', email: 'sender@example.com' },
        replyTo: 'reply@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
        headers: { 'X-Custom': 'value' },
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          reply_to: 'reply@example.com',
          headers: { 'X-Custom': 'value' },
        }),
      );
    });

    it('should convert tags to Resend format', async () => {
      mockSend.mockResolvedValue({
        data: { id: 'msg-789' },
        error: null,
      });

      await adapter.send({
        to: 'recipient@example.com',
        from: { name: 'Sender', email: 'sender@example.com' },
        subject: 'Test',
        html: '<p>Hello</p>',
        tags: ['campaign', 'newsletter'],
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [
            { name: 'campaign', value: 'true' },
            { name: 'newsletter', value: 'true' },
          ],
        }),
      );
    });
  });

  describe('sendBatch', () => {
    it('should send multiple emails and aggregate results', async () => {
      mockSend
        .mockResolvedValueOnce({ data: { id: 'msg-1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'msg-2' }, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'Bounced' } });

      const result = await adapter.sendBatch({
        messages: [
          { to: 'a@example.com', from: { name: 'S', email: 's@e.com' }, subject: 'A', html: '<p>A</p>' },
          { to: 'b@example.com', from: { name: 'S', email: 's@e.com' }, subject: 'B', html: '<p>B</p>' },
          { to: 'c@example.com', from: { name: 'S', email: 's@e.com' }, subject: 'C', html: '<p>C</p>' },
        ],
      });

      expect(result.totalSent).toBe(2);
      expect(result.totalFailed).toBe(1);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]!.success).toBe(true);
      expect(result.results[2]!.success).toBe(false);
    });
  });
});
