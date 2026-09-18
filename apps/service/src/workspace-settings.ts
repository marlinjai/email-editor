import type { WorkspaceSettings } from '@marlinjai/mail-contract';
import { ApiError } from './api-error.js';

/** What a new workspace starts with: English only, tracking off, assets from anywhere. */
export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  default_locale: 'en',
  locales: ['en'],
  tracking_enabled: false,
  asset_policy: 'any',
};

/**
 * Settings as stored, completed with the defaults of every field added since
 * the row was written (a workspace created before `asset_policy` existed has
 * none in its jsonb). Every read of a workspace row goes through this, so no
 * backfill migration is needed when a setting is added.
 */
export function withSettingDefaults(stored: Partial<WorkspaceSettings> | null | undefined): WorkspaceSettings {
  return { ...DEFAULT_WORKSPACE_SETTINGS, ...(stored ?? {}) };
}

/**
 * Applies a partial settings change and checks the one rule the schema cannot
 * express on a partial: the default language has to be one the pages are
 * actually offered in.
 */
export function mergeSettings(base: WorkspaceSettings, patch: Partial<WorkspaceSettings> | undefined): WorkspaceSettings {
  const merged = { ...base, ...(patch ?? {}) };
  if (!merged.locales.includes(merged.default_locale)) {
    throw new ApiError('validation_failed', 'The workspace settings are not valid.', {
      issues: [
        { path: ['settings', 'default_locale'], message: `default_locale "${merged.default_locale}" must be one of locales` },
      ],
    });
  }
  return merged;
}
