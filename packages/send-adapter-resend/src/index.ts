import { Resend } from 'resend';
import type {
  SendAdapter,
  SendOptions,
  SendResult,
  BatchSendOptions,
  BatchSendResult,
} from '@marlinjai/email-campaigns';

export interface ResendSendAdapterConfig {
  apiKey: string;
}

export class ResendSendAdapter implements SendAdapter {
  private client: Resend;

  constructor(config: ResendSendAdapterConfig) {
    this.client = new Resend(config.apiKey);
  }

  async send(options: SendOptions): Promise<SendResult> {
    try {
      const response = await this.client.emails.send({
        from: `${options.from.name} <${options.from.email}>`,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        reply_to: options.replyTo,
        headers: options.headers,
        tags: options.tags?.map((tag) => ({ name: tag, value: 'true' })),
      });

      if (response.error) {
        return {
          success: false,
          error: response.error.message,
        };
      }

      return {
        success: true,
        messageId: response.data?.id,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error sending email',
      };
    }
  }

  async sendBatch(options: BatchSendOptions): Promise<BatchSendResult> {
    const results: SendResult[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Resend supports batch sending natively, but we send individually
    // for per-recipient tracking and error isolation
    for (const message of options.messages) {
      const result = await this.send(message);
      results.push(result);
      if (result.success) {
        totalSent++;
      } else {
        totalFailed++;
      }
    }

    return { results, totalSent, totalFailed };
  }
}
