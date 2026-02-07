// packages/core/src/api/validation.ts
// API key validation and usage tracking

import type { ApiKeyValidation, ApiTier, UsageRecord, TIER_LIMITS } from './types';

/**
 * In-memory usage tracking (replace with database in production)
 * This is a simple implementation for demonstration
 */
const usageStore = new Map<string, { count: number; resetAt: Date }>();

/**
 * Validate API key format
 * Keys are expected in format: ek_{tier}_{random}
 * e.g., ek_free_abc123, ek_pro_xyz789
 */
export function parseApiKey(apiKey: string): { tier: ApiTier; valid: boolean } {
  if (!apiKey || typeof apiKey !== 'string') {
    return { tier: 'free', valid: false };
  }

  const parts = apiKey.split('_');
  if (parts.length !== 3 || parts[0] !== 'ek') {
    return { tier: 'free', valid: false };
  }

  const tier = parts[1] as ApiTier;
  if (!['free', 'pro', 'scale'].includes(tier)) {
    return { tier: 'free', valid: false };
  }

  // Basic length check for the random part
  if (parts[2].length < 8) {
    return { tier: 'free', valid: false };
  }

  return { tier, valid: true };
}

/**
 * Validate an API key and check rate limits
 * In production, this would query a database
 */
export async function validateApiKey(apiKey: string | undefined): Promise<ApiKeyValidation> {
  // No API key = free tier (preview mode)
  if (!apiKey) {
    return {
      isValid: true,
      tier: 'free',
      rateLimitRemaining: 100,
    };
  }

  const parsed = parseApiKey(apiKey);
  if (!parsed.valid) {
    return {
      isValid: false,
      tier: 'free',
      error: 'Invalid API key format',
    };
  }

  // Check usage limits
  const usage = getUsage(apiKey);
  const tierLimits = getTierLimits(parsed.tier);
  const remaining = tierLimits.monthlyCompiles - usage.count;

  if (remaining <= 0) {
    return {
      isValid: false,
      tier: parsed.tier,
      error: 'Monthly compile limit exceeded',
      rateLimitRemaining: 0,
    };
  }

  return {
    isValid: true,
    tier: parsed.tier,
    rateLimitRemaining: remaining,
  };
}

/**
 * Get current usage for an API key
 */
function getUsage(apiKey: string): { count: number; resetAt: Date } {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const stored = usageStore.get(apiKey);
  
  // Reset if new month
  if (!stored || stored.resetAt < monthStart) {
    const newUsage = { count: 0, resetAt: monthEnd };
    usageStore.set(apiKey, newUsage);
    return newUsage;
  }

  return stored;
}

/**
 * Increment usage counter for an API key
 */
export function incrementUsage(apiKey: string): void {
  const usage = getUsage(apiKey);
  usage.count++;
  usageStore.set(apiKey, usage);
}

/**
 * Get tier limits
 */
function getTierLimits(tier: ApiTier): { monthlyCompiles: number; noWatermark: boolean } {
  const limits: Record<ApiTier, { monthlyCompiles: number; noWatermark: boolean }> = {
    free: { monthlyCompiles: 100, noWatermark: false },
    pro: { monthlyCompiles: 5000, noWatermark: true },
    scale: { monthlyCompiles: 50000, noWatermark: true },
  };
  return limits[tier];
}

/**
 * Check if tier should have watermark
 */
export function shouldAddWatermark(tier: ApiTier): boolean {
  return tier === 'free';
}

