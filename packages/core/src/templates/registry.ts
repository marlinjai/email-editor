// packages/core/src/templates/registry.ts
// Pre-built template registry implementation

import type { PrebuiltTemplate, PrebuiltCategory, PrebuiltTemplateRegistry } from './types';

/**
 * Registry for pre-built templates
 */
class PrebuiltTemplateRegistryImpl implements PrebuiltTemplateRegistry {
  private templates: Map<string, PrebuiltTemplate> = new Map();

  /**
   * Register a pre-built template
   */
  register(template: PrebuiltTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID
   */
  get(id: string): PrebuiltTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all registered templates
   */
  getAll(): PrebuiltTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates filtered by category
   */
  getByCategory(category: PrebuiltCategory): PrebuiltTemplate[] {
    return this.getAll().filter((t) => t.category === category);
  }
}

/**
 * Create a new pre-built template registry
 */
export function createPrebuiltTemplateRegistry(): PrebuiltTemplateRegistry {
  return new PrebuiltTemplateRegistryImpl();
}

