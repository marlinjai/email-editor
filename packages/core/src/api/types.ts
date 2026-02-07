// packages/core/src/api/types.ts
// Types for the compile API and billing

/**
 * API key tiers for pricing
 */
export type ApiTier = 'free' | 'pro' | 'scale';

/**
 * API key validation result
 */
export interface ApiKeyValidation {
  isValid: boolean;
  tier: ApiTier;
  customerId?: string;
  error?: string;
  rateLimitRemaining?: number;
}

/**
 * Usage tracking record
 */
export interface UsageRecord {
  apiKey: string;
  timestamp: Date;
  compileCount: number;
  tier: ApiTier;
}

/**
 * Compile request from client
 */
export interface CompileRequest {
  template: unknown;
  apiKey?: string;
  preview?: boolean;
}

/**
 * Compile response to client
 */
export interface CompileResponse {
  success: boolean;
  html?: string;
  mjml?: string;
  errors?: string[];
  watermark?: boolean;
  usageRemaining?: number;
}

/**
 * Tier limits configuration
 */
export interface TierLimits {
  /** Compiles per month */
  monthlyCompiles: number;
  /** Remove watermark */
  noWatermark: boolean;
  /** Priority support */
  prioritySupport: boolean;
  /** Custom compile endpoint */
  customEndpoint: boolean;
}

/**
 * Tier limits configuration
 */
export const TIER_LIMITS: Record<ApiTier, TierLimits> = {
  free: {
    monthlyCompiles: 100,
    noWatermark: false,
    prioritySupport: false,
    customEndpoint: false,
  },
  pro: {
    monthlyCompiles: 5000,
    noWatermark: true,
    prioritySupport: false,
    customEndpoint: false,
  },
  scale: {
    monthlyCompiles: 50000,
    noWatermark: true,
    prioritySupport: true,
    customEndpoint: true,
  },
};

