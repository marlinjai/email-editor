// packages/core/src/templates/types.ts
// Pre-built template type definitions

import type { Section } from '../schema/types';

/**
 * Categories for pre-built templates
 */
export type PrebuiltCategory =
  | 'logo'
  | 'hero'
  | 'features'
  | 'products'
  | 'articles'
  | 'footer'
  | 'navigation'
  | 'content';

/**
 * Pre-built template definition
 * Contains a complete section structure that can be dropped into the editor
 */
export interface PrebuiltTemplate {
  id: string;
  name: string;
  category: PrebuiltCategory;
  description?: string;
  thumbnail?: string;
  section: Section;
}

/**
 * Pre-built template registry interface
 */
export interface PrebuiltTemplateRegistry {
  register(template: PrebuiltTemplate): void;
  get(id: string): PrebuiltTemplate | undefined;
  getAll(): PrebuiltTemplate[];
  getByCategory(category: PrebuiltCategory): PrebuiltTemplate[];
}

