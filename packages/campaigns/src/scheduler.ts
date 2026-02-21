import type { Campaign, CampaignStorageAdapter } from './types';

/**
 * Find campaigns that are scheduled and ready to send.
 * Compares scheduledAt against the current time, with optional timezone offset.
 */
export async function getScheduledCampaignsReadyToSend(
  adapter: CampaignStorageAdapter,
): Promise<Campaign[]> {
  const result = await adapter.listCampaigns({ status: 'scheduled', pageSize: 100 });
  const now = new Date();

  return result.data.filter((campaign) => {
    if (!campaign.scheduledAt) return false;
    const scheduledTime = new Date(campaign.scheduledAt);
    return scheduledTime <= now;
  });
}

/**
 * Convert a local datetime + timezone to a UTC ISO string.
 * Used when scheduling campaigns with a specific timezone.
 */
export function toUTCScheduledTime(
  localDatetime: string,
  timezone?: string,
): string {
  if (!timezone) {
    // Assume the input is already in UTC or has timezone info
    return new Date(localDatetime).toISOString();
  }

  // Use Intl.DateTimeFormat to resolve timezone offset
  try {
    const date = new Date(localDatetime);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Get the offset by comparing local and UTC representations
    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    const tzDate = new Date(
      `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`,
    );

    // Calculate offset between the timezone representation and UTC
    const offset = tzDate.getTime() - date.getTime();
    const utcDate = new Date(date.getTime() - offset);

    return utcDate.toISOString();
  } catch {
    // Fallback: treat as UTC
    return new Date(localDatetime).toISOString();
  }
}
