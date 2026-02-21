import type { ABTestConfig, ABVariant } from './types';
import type { Contact } from '@marlinjai/email-contacts';

export interface ABTestGroup {
  variant: ABVariant;
  contacts: Contact[];
}

export interface ABTestSplit {
  testGroups: ABTestGroup[];
  remainingContacts: Contact[];
}

export interface ABTestResult {
  variantId: string;
  variantName: string;
  totalSent: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
}

/**
 * Split an audience into A/B test groups and a remaining group.
 *
 * The testPercentage of the total audience is split among variants
 * according to their percentage allocations. The rest of the audience
 * is held back to receive the winning variant.
 */
export function splitAudience(
  contacts: Contact[],
  config: ABTestConfig,
): ABTestSplit {
  if (!config.enabled || config.variants.length === 0) {
    return { testGroups: [], remainingContacts: contacts };
  }

  // Shuffle contacts for randomization
  const shuffled = [...contacts].sort(() => Math.random() - 0.5);

  const testSize = Math.floor(shuffled.length * (config.testPercentage / 100));
  const testContacts = shuffled.slice(0, testSize);
  const remainingContacts = shuffled.slice(testSize);

  // Split test contacts among variants by their percentage allocations
  const testGroups: ABTestGroup[] = [];
  let offset = 0;

  for (const variant of config.variants) {
    const variantSize = Math.floor(testContacts.length * (variant.percentage / 100));
    const variantContacts = testContacts.slice(offset, offset + variantSize);
    offset += variantSize;

    testGroups.push({
      variant,
      contacts: variantContacts,
    });
  }

  // Assign any rounding-remainder contacts to the first variant
  if (offset < testContacts.length && testGroups.length > 0) {
    testGroups[0]!.contacts.push(...testContacts.slice(offset));
  }

  return { testGroups, remainingContacts };
}

/**
 * Determine the winning variant based on the configured criteria.
 * Returns the variant ID with the highest metric.
 */
export function determineWinner(
  results: ABTestResult[],
  criteria: ABTestConfig['winnerCriteria'],
): ABTestResult | null {
  if (results.length === 0) return null;

  const metric = criteria === 'open_rate' ? 'openRate' : 'clickRate';

  return results.reduce((best, current) =>
    current[metric] > best[metric] ? current : best,
  );
}

/**
 * Calculate A/B test results from raw tracking data.
 */
export function calculateResults(
  variants: ABVariant[],
  sentCounts: Record<string, number>,
  openCounts: Record<string, number>,
  clickCounts: Record<string, number>,
): ABTestResult[] {
  return variants.map((variant) => {
    const totalSent = sentCounts[variant.id] ?? 0;
    const opens = openCounts[variant.id] ?? 0;
    const clicks = clickCounts[variant.id] ?? 0;

    return {
      variantId: variant.id,
      variantName: variant.name,
      totalSent,
      opens,
      clicks,
      openRate: totalSent > 0 ? opens / totalSent : 0,
      clickRate: totalSent > 0 ? clicks / totalSent : 0,
    };
  });
}

/**
 * Check if the test duration has elapsed since the test started.
 */
export function isTestComplete(
  testStartedAt: string,
  durationHours: number,
): boolean {
  const started = new Date(testStartedAt);
  const elapsed = Date.now() - started.getTime();
  const durationMs = durationHours * 60 * 60 * 1000;
  return elapsed >= durationMs;
}
