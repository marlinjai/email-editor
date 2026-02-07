// packages/core/src/api/index.ts
// API utilities for compile endpoint

export type {
  ApiTier,
  ApiKeyValidation,
  UsageRecord,
  CompileRequest,
  CompileResponse,
  TierLimits,
} from './types';

export { TIER_LIMITS } from './types';

export {
  parseApiKey,
  validateApiKey,
  incrementUsage,
  shouldAddWatermark,
} from './validation';

export {
  injectWatermark,
  hasWatermark,
} from './watermark';

