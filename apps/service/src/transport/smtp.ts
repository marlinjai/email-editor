import nodemailer from 'nodemailer';
import {
  OutcomeUnknownSendError,
  PermanentSendError,
  TransientSendError,
  type OutgoingMessage,
  type SendError,
  type SendResult,
  type Transport,
} from './types.js';

export type SmtpSettings = {
  host: string;
  port: number;
  /** `tls` connects encrypted (465); `starttls` upgrades and refuses to continue without it (587). */
  security: 'tls' | 'starttls';
  username: string;
  /** Opened from the provider's sealed secret just before use; never logged. */
  password: string;
};

const TIMEOUT_MS = 30_000;

/** Commands before the message body is handed over; a failure there cannot have delivered anything. */
const BEFORE_BODY = new Set(['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH PLAIN', 'AUTH LOGIN', 'AUTH XOAUTH2', 'AUTH CRAM-MD5', 'MAIL FROM', 'RCPT TO', 'API']);

type NodemailerError = Error & { code?: string; command?: string; responseCode?: number; response?: string };

/**
 * Maps a nodemailer failure onto the Transport contract (src/transport/types.ts):
 * a 4xx reply is transient, a 5xx reply permanent, a network or protocol error
 * before the body was sent transient, and anything that breaks during or after
 * DATA leaves the outcome unknown.
 */
export function classifySmtpError(err: unknown): SendError {
  const e = err as NodemailerError;
  const detail = e?.response ?? e?.message ?? String(err);
  const code = typeof e?.responseCode === 'number' ? e.responseCode : null;
  if (code !== null && code >= 500) return new PermanentSendError(detail, code);
  if (code !== null && code >= 400) return new TransientSendError(detail, code);
  if (e?.code === 'EAUTH') return new PermanentSendError(`authentication failed: ${detail}`, code);
  if (e?.code === 'EENVELOPE') return new PermanentSendError(`invalid envelope: ${detail}`, code);
  if (!e?.command || BEFORE_BODY.has(e.command)) return new TransientSendError(detail, code);
  return new OutcomeUnknownSendError(`connection lost during ${e.command}: ${detail}`, code);
}

/** A Transport over SMTP with nodemailer: one pooled connection, TLS always required. */
export function createSmtpTransport(settings: SmtpSettings): Transport {
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'tls',
    requireTLS: settings.security === 'starttls',
    auth: { user: settings.username, pass: settings.password },
    pool: true,
    maxConnections: 1,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  return {
    async send(message: OutgoingMessage): Promise<SendResult> {
      try {
        const info = await transporter.sendMail({
          from: { name: message.from.name, address: message.from.email },
          to: message.to,
          replyTo: message.replyTo ?? undefined,
          subject: message.subject,
          html: message.html,
          text: message.text,
          headers: message.headers,
        });
        if (info.rejected.length > 0 && info.accepted.length === 0) {
          throw new PermanentSendError(`every recipient was rejected: ${info.response}`);
        }
        return { messageId: info.messageId ?? null };
      } catch (err) {
        if (err instanceof PermanentSendError) throw err;
        throw classifySmtpError(err);
      }
    },

    async verify(): Promise<void> {
      try {
        await transporter.verify();
      } catch (err) {
        throw classifySmtpError(err);
      }
    },

    async close(): Promise<void> {
      transporter.close();
    },
  };
}
