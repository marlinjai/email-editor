import { describe, expect, it } from 'vitest';
import {
  classifySmtpError,
  MemoryTransport,
  OutcomeUnknownSendError,
  PermanentSendError,
  TransientSendError,
  type OutgoingMessage,
} from '../../src/transport/index.js';

const message: OutgoingMessage = {
  from: { name: 'Sender', email: 'news@example.com' },
  to: ['person@example.com'],
  replyTo: null,
  subject: 'Hello',
  html: '<p>Hi</p>',
  headers: { 'List-Unsubscribe': '<https://mail.example/u/t>' },
};

describe('MemoryTransport', () => {
  it('records accepted sends with deterministic ids', async () => {
    const t = new MemoryTransport();
    expect(await t.send(message)).toEqual({ messageId: 'mem-1' });
    expect(await t.send(message)).toEqual({ messageId: 'mem-2' });
    expect(t.sent.map((s) => s.messageId)).toEqual(['mem-1', 'mem-2']);
    expect(t.sent[0]!.headers['List-Unsubscribe']).toBe('<https://mail.example/u/t>');
  });

  it('fails transiently and permanently on request, then recovers', async () => {
    const t = new MemoryTransport().failNext('transient').failNext('permanent');
    await expect(t.send(message)).rejects.toBeInstanceOf(TransientSendError);
    await expect(t.send(message)).rejects.toBeInstanceOf(PermanentSendError);
    await expect(t.send(message)).resolves.toEqual({ messageId: 'mem-1' });
    expect(t.attempts).toHaveLength(3);
    expect(t.sent).toHaveLength(1);
  });

  it('repeats a failure the given number of times', async () => {
    const t = new MemoryTransport().failNext('transient', 2);
    await expect(t.send(message)).rejects.toBeInstanceOf(TransientSendError);
    await expect(t.send(message)).rejects.toBeInstanceOf(TransientSendError);
    await expect(t.send(message)).resolves.toBeDefined();
  });

  it('hangs until released', async () => {
    const t = new MemoryTransport().failNext('hang');
    const pending = t.send(message);
    let settled = false;
    pending.catch(() => (settled = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    expect(t.hanging).toBe(1);
    t.release();
    await expect(pending).rejects.toBeInstanceOf(TransientSendError);
    expect(t.sent).toHaveLength(0);
  });

  it('crash: the provider accepted the message, but the caller sees a plain error', async () => {
    const t = new MemoryTransport().failNext('crash');
    const err = await t.send(message).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TransientSendError);
    expect(err).not.toBeInstanceOf(PermanentSendError);
    expect(t.sent).toHaveLength(1);
  });

  it('verify fails when told to, and send refuses after close', async () => {
    const t = new MemoryTransport();
    await expect(t.verify()).resolves.toBeUndefined();
    t.verifyError = new PermanentSendError('bad credentials', 535);
    await expect(t.verify()).rejects.toThrow('bad credentials');
    await t.close();
    await expect(t.send(message)).rejects.toThrow(/after close/);
  });
});

describe('classifySmtpError', () => {
  const err = (props: Record<string, unknown>) => Object.assign(new Error('boom'), props);

  it('treats a 4xx reply as transient and a 5xx reply as permanent', () => {
    expect(classifySmtpError(err({ responseCode: 451, command: 'RCPT TO' }))).toBeInstanceOf(TransientSendError);
    expect(classifySmtpError(err({ responseCode: 421, command: 'DATA' }))).toBeInstanceOf(TransientSendError);
    const permanent = classifySmtpError(err({ responseCode: 550, command: 'RCPT TO', response: '550 no such user' }));
    expect(permanent).toBeInstanceOf(PermanentSendError);
    expect(permanent.code).toBe(550);
    expect(permanent.message).toContain('no such user');
  });

  it('treats bad credentials and a bad envelope as permanent', () => {
    expect(classifySmtpError(err({ code: 'EAUTH', command: 'AUTH PLAIN' }))).toBeInstanceOf(PermanentSendError);
    expect(classifySmtpError(err({ code: 'EENVELOPE' }))).toBeInstanceOf(PermanentSendError);
  });

  it('treats a network failure before the body as transient', () => {
    expect(classifySmtpError(err({ code: 'ECONNREFUSED', command: 'CONN' }))).toBeInstanceOf(TransientSendError);
    expect(classifySmtpError(err({ code: 'ETIMEDOUT' }))).toBeInstanceOf(TransientSendError);
  });

  it('treats a connection lost during or after DATA as outcome unknown', () => {
    expect(classifySmtpError(err({ code: 'ECONNRESET', command: 'DATA' }))).toBeInstanceOf(OutcomeUnknownSendError);
    expect(classifySmtpError(err({ code: 'ETIMEDOUT', command: 'DATA' }))).toBeInstanceOf(OutcomeUnknownSendError);
  });
});
