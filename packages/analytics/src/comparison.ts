import type { CampaignStats, CampaignComparison, AnalyticsStorageAdapter } from './types';
import type { Campaign, CampaignStorageAdapter } from '@marlinjai/email-campaigns';

export interface ComparisonInput {
  campaignIds: string[];
}

/**
 * Generate a comparison report for multiple campaigns.
 */
export async function compareCampaigns(
  campaignIds: string[],
  campaignAdapter: CampaignStorageAdapter,
  analyticsAdapter: AnalyticsStorageAdapter,
): Promise<CampaignComparison> {
  const campaigns: CampaignComparison['campaigns'] = [];

  for (const id of campaignIds) {
    const campaign = await campaignAdapter.getCampaign(id);
    const stats = await analyticsAdapter.getCampaignStats(id);

    if (campaign && stats) {
      campaigns.push({
        campaignId: id,
        name: campaign.name,
        stats,
      });
    }
  }

  return { campaigns };
}

/**
 * Determine the best-performing campaign from a comparison.
 */
export function getBestPerformer(
  comparison: CampaignComparison,
  metric: 'openRate' | 'clickRate' | 'clickToOpenRate',
): CampaignComparison['campaigns'][number] | null {
  if (comparison.campaigns.length === 0) return null;

  return comparison.campaigns.reduce((best, current) =>
    current.stats[metric] > best.stats[metric] ? current : best,
  );
}

/**
 * Calculate percentage improvement between two campaigns.
 */
export function calculateImprovement(
  baseline: CampaignStats,
  variant: CampaignStats,
  metric: 'openRate' | 'clickRate' | 'clickToOpenRate',
): number {
  const baseValue = baseline[metric];
  if (baseValue === 0) return variant[metric] > 0 ? 100 : 0;
  return ((variant[metric] - baseValue) / baseValue) * 100;
}
