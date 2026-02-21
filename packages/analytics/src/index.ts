// Types
export type {
  TrackingEvent,
  TrackingEventType,
  RecordEventInput,
  CampaignStats,
  LinkClickStats,
  ContactEngagement,
  CampaignComparison,
  EventListOptions,
  AnalyticsStorageAdapter,
  CSVExportOptions,
} from './types';

// Tracker
export { AnalyticsTracker, aggregateStats } from './tracker';
export type { AnalyticsTrackerConfig } from './tracker';

// Data Brain adapter
export { DataBrainAnalyticsAdapter } from './adapter';
export type { DataBrainAnalyticsAdapterConfig } from './adapter';

// Endpoints
export {
  handleOpenTrack,
  handleClickTrack,
  parseTrackingParams,
  getTransparentGif,
} from './endpoints';
export type { TrackingEndpointRequest } from './endpoints';

// Engagement
export {
  calculateEngagementScore,
  buildContactEngagement,
  categorizeEngagement,
} from './engagement';
export type { EngagementWeights, EngagementLevel } from './engagement';

// Heatmap
export { generateHeatmapData, injectHeatmapOverlay } from './heatmap';
export type { HeatmapLink, HeatmapIntensity } from './heatmap';

// Comparison
export { compareCampaigns, getBestPerformer, calculateImprovement } from './comparison';

// Export
export { exportStatsToCSV, exportEventsToCSV, exportLinkClicksToCSV } from './export';

// Schema
export { ANALYTICS_TABLES } from './schema';
