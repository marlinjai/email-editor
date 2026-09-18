import { describe, expect, it } from 'vitest';
import { formatUsageWarningHeader, parseUsageWarningHeader } from './billing';

describe('the usage warning header', () => {
  it('round-trips through format and parse', () => {
    const warnings = [
      { metric: 'messages' as const, used: 8200, limit: 10000 },
      { metric: 'contacts' as const, used: 500, limit: 500 },
    ];
    const header = formatUsageWarningHeader(warnings);
    expect(header).toBe('messages=8200/10000,contacts=500/500');
    expect(parseUsageWarningHeader(header)).toEqual(warnings);
  });

  it('is absent when nothing is near a limit', () => {
    expect(formatUsageWarningHeader([])).toBeNull();
    expect(parseUsageWarningHeader(null)).toEqual([]);
    expect(parseUsageWarningHeader('')).toEqual([]);
  });

  it('skips entries it cannot read and keeps the rest', () => {
    expect(parseUsageWarningHeader('bogus=1/2, messages=9/10 ,contacts=x/5,members=3')).toEqual([{ metric: 'messages', used: 9, limit: 10 }]);
  });
});
