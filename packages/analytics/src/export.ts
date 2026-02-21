import type { CampaignStats, TrackingEvent, LinkClickStats, CSVExportOptions } from './types';

/**
 * Export campaign stats as CSV.
 */
export function exportStatsToCSV(
  stats: CampaignStats[],
  options?: CSVExportOptions,
): string {
  const defaultColumns = [
    'campaignId',
    'totalSent',
    'totalDelivered',
    'totalOpens',
    'uniqueOpens',
    'totalClicks',
    'uniqueClicks',
    'totalBounces',
    'totalUnsubscribes',
    'openRate',
    'clickRate',
    'clickToOpenRate',
    'bounceRate',
    'unsubscribeRate',
  ];

  const columns = options?.columns ?? defaultColumns;
  const includeHeaders = options?.includeHeaders ?? true;

  const rows: string[] = [];

  if (includeHeaders) {
    rows.push(columns.join(','));
  }

  for (const stat of stats) {
    const values = columns.map((col) => {
      const value = (stat as unknown as Record<string, unknown>)[col];
      return escapeCSVField(String(value ?? ''));
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

/**
 * Export tracking events as CSV.
 */
export function exportEventsToCSV(
  events: TrackingEvent[],
  options?: CSVExportOptions,
): string {
  const defaultColumns = [
    'id',
    'campaignId',
    'contactId',
    'type',
    'url',
    'timestamp',
  ];

  const columns = options?.columns ?? defaultColumns;
  const includeHeaders = options?.includeHeaders ?? true;

  const rows: string[] = [];

  if (includeHeaders) {
    rows.push(columns.join(','));
  }

  for (const event of events) {
    const values = columns.map((col) => {
      const value = (event as unknown as Record<string, unknown>)[col];
      return escapeCSVField(String(value ?? ''));
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

/**
 * Export link click stats as CSV.
 */
export function exportLinkClicksToCSV(
  links: LinkClickStats[],
  options?: CSVExportOptions,
): string {
  const defaultColumns = ['url', 'totalClicks', 'uniqueClicks'];
  const columns = options?.columns ?? defaultColumns;
  const includeHeaders = options?.includeHeaders ?? true;

  const rows: string[] = [];

  if (includeHeaders) {
    rows.push(columns.join(','));
  }

  for (const link of links) {
    const values = columns.map((col) => {
      const value = (link as unknown as Record<string, unknown>)[col];
      return escapeCSVField(String(value ?? ''));
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
