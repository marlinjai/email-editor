import { describe, expect, it } from 'vitest';
import type { RunMessage } from '../../src/repo/messages.js';
import { BREAKER, judgeRun } from '../../src/worker/breaker.js';

let seq = 0;
const sent = (): RunMessage => ({ id: `m${++seq}`, error: null, rejection_class: null, rejection_signature: null });
const dead = (signature: string): RunMessage => ({
  id: `m${++seq}`,
  error: `550 5.1.1 ${signature}`,
  rejection_class: 'recipient',
  rejection_signature: `550 5.1.1 ${signature}`,
});
const policy = (): RunMessage => ({ id: `m${++seq}`, error: '550 5.7.1 blocked', rejection_class: 'sender', rejection_signature: '550 5.7.1 blocked' });

/** A run as the worker sees it: the first WINDOW and the last STREAK messages. */
const judge = (run: RunMessage[]) => judgeRun(run.slice(0, BREAKER.WINDOW), run.slice(-BREAKER.STREAK));

describe('judgeRun', () => {
  it('does not trip on a clean run or a few scattered bounces', () => {
    expect(judge([]).trip).toBe(false);
    expect(judge([sent(), sent(), dead('a'), sent(), dead('b')]).trip).toBe(false);
  });

  it('trips on five refusals in a row with the same reply', () => {
    const verdict = judge([sent(), ...Array.from({ length: 5 }, () => dead('user unknown'))]);
    expect(verdict).toMatchObject({ trip: true, sample: '550 5.1.1 user unknown' });
  });

  it('does not trip on four in a row, or five in a row with different replies', () => {
    expect(judge(Array.from({ length: 4 }, () => dead('user unknown'))).trip).toBe(false);
    expect(judge(['a', 'b', 'c', 'd', 'e'].map(dead)).trip).toBe(false);
  });

  it('a delivery or a rejection of another kind breaks the streak', () => {
    const same = () => dead('user unknown');
    expect(judge([same(), same(), same(), same(), sent(), same()]).trip).toBe(false);
    expect(judge([same(), same(), policy(), same(), same(), same()]).trip).toBe(false);
  });

  it('trips when more than 20 percent of the first 50 are refused, at the eleventh', () => {
    const ten = Array.from({ length: 10 }, (_, i) => [dead(`r${i}`), sent()]).flat();
    expect(judge(ten).trip).toBe(false);
    const verdict = judge([...ten, dead('r10')]);
    expect(verdict.trip).toBe(true);
    if (verdict.trip) expect(verdict.reason).toMatch(/20 percent of the first 50/);
  });

  it('refusals after the first 50 do not count toward the share', () => {
    const clean = Array.from({ length: 50 }, sent);
    const late = Array.from({ length: 11 }, (_, i) => [dead(`late${i}`), sent()]).flat();
    expect(judge([...clean, ...late]).trip).toBe(false);
  });
});
