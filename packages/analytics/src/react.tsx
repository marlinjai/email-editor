// React components for analytics package
export { CampaignReport } from './components/CampaignReport';
export type { CampaignReportProps } from './components/CampaignReport';

export { HeatmapOverlay } from './components/HeatmapOverlay';
export type { HeatmapOverlayProps } from './components/HeatmapOverlay';

export { EngagementScoreCard } from './components/EngagementScoreCard';
export type { EngagementScoreCardProps } from './components/EngagementScoreCard';

export { ComparisonChart } from './components/ComparisonChart';
export type { ComparisonChartProps } from './components/ComparisonChart';

// Re-export core types for convenience
export type {
  TrackingEvent,
  TrackingEventType,
  CampaignStats,
  LinkClickStats,
  ContactEngagement,
  CampaignComparison,
  AnalyticsStorageAdapter,
} from './types';
