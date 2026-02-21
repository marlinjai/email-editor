// React components for campaigns package
export { CampaignWizard } from './components/CampaignWizard';
export type { CampaignWizardProps } from './components/CampaignWizard';

export { CampaignList } from './components/CampaignList';
export type { CampaignListProps } from './components/CampaignList';

export { CampaignDetail } from './components/CampaignDetail';
export type { CampaignDetailProps } from './components/CampaignDetail';

export { SendPreview } from './components/SendPreview';
export type { SendPreviewProps } from './components/SendPreview';

// Re-export core types for convenience
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
} from './types';
