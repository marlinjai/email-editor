// Types
export type {
  Campaign,
  CampaignStatus,
  CampaignRecipient,
  CampaignListOptions,
  CampaignStorageAdapter,
  CreateCampaignInput,
  UpdateCampaignInput,
  ScheduleCampaignInput,
  SendAdapter,
  SendOptions,
  SendResult,
  BatchSendOptions,
  BatchSendResult,
  ABTestConfig,
  ABVariant,
} from './types';

// Manager
export { CampaignManager } from './manager';
export type { CampaignManagerConfig } from './manager';

// Data Brain adapter
export { DataBrainCampaignAdapter } from './adapter';
export type { DataBrainCampaignAdapterConfig } from './adapter';

// Tracking
export { injectTrackingPixel, rewriteLinksForTracking } from './tracking';

// Scheduler
export { getScheduledCampaignsReadyToSend, toUTCScheduledTime } from './scheduler';

// A/B Testing
export {
  splitAudience,
  determineWinner,
  calculateResults,
  isTestComplete,
} from './ab-testing';
export type { ABTestGroup, ABTestSplit, ABTestResult } from './ab-testing';

// Schema
export { CAMPAIGN_TABLES } from './schema';
