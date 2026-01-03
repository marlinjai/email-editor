// packages/core/src/registry/types.ts
// Block registry type definitions

import { z } from 'zod';
import type { Block } from '../schema/types';

/**
 * Block category for organization
 */
export type BlockCategory = 'text' | 'media' | 'layout' | 'brand';

/**
 * Block definition for registration
 */
export interface BlockDefinition<T extends Block = Block> {
  type: string;
  label: string;
  category: BlockCategory;
  icon?: string; // Icon name or SVG
  description?: string;
  locked?: boolean; // If true, block cannot be edited
  defaultProps: Omit<T, 'id' | 'type'>;
  propSchema: z.ZodType<Omit<T, 'id' | 'type'>>;
  toMJML: (block: T) => string;
}

/**
 * Registry for storing block definitions
 */
export interface BlockRegistry {
  register<T extends Block>(definition: BlockDefinition<T>): void;
  unregister(type: string): void;
  get(type: string): BlockDefinition | undefined;
  getAll(): BlockDefinition[];
  getByCategory(category: BlockCategory): BlockDefinition[];
  has(type: string): boolean;
}

