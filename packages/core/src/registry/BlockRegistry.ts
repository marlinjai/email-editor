// packages/core/src/registry/BlockRegistry.ts
// Block registry implementation

import type { BlockDefinition, BlockCategory } from './types';
import type { Block } from '../schema/types';

/**
 * Registry for managing block definitions
 * Allows registering custom blocks and retrieving their metadata
 */
export class BlockRegistryImpl {
  private definitions = new Map<string, BlockDefinition>();

  /**
   * Register a new block definition
   */
  register<T extends Block>(definition: BlockDefinition<T>): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`Block type "${definition.type}" is already registered. Overwriting.`);
    }
    // Type assertion is safe here as we store all block definitions generically
    this.definitions.set(definition.type, definition as unknown as BlockDefinition);
  }

  /**
   * Unregister a block definition
   */
  unregister(type: string): void {
    this.definitions.delete(type);
  }

  /**
   * Get a block definition by type
   */
  get(type: string): BlockDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Get all registered block definitions
   */
  getAll(): BlockDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Get blocks by category
   */
  getByCategory(category: BlockCategory): BlockDefinition[] {
    return this.getAll().filter((def) => def.category === category);
  }

  /**
   * Check if a block type is registered
   */
  has(type: string): boolean {
    return this.definitions.has(type);
  }
}

/**
 * Create a new block registry instance
 */
export function createBlockRegistry(): BlockRegistryImpl {
  return new BlockRegistryImpl();
}

