// packages/blocks/src/prebuilt/index.ts
// Pre-built template exports and registry with ReTurn Hypnosis branding

import { createPrebuiltTemplateRegistry } from '@marlinjai/email-editor-core';

// Import brand constants
export * from './return-brand';

// Import template collections
import { heroTemplates } from './hero-templates';
import { contentTemplates } from './content-templates';
import { featureTemplates } from './feature-templates';
import { marketingTemplates } from './marketing-templates';
import { utilityTemplates } from './utility-templates';

// Export individual template modules
export * from './hero-templates';
export * from './content-templates';
export * from './feature-templates';
export * from './marketing-templates';
export * from './utility-templates';

/**
 * All pre-built templates organized by category
 * 
 * Categories:
 * - hero (4): Main, Newsletter, Minimal, Split
 * - content (8): Text+Image Right/Left, Section Titles 1-3, Quote, Divider, Spacer
 * - features (5): 2-col, 3-col, 4-col, 4-col row 2, Take Action
 * - marketing (9): Events (2), Coupons (3), Products/Services (4)
 * - utility (9): Signatures (4), Buttons, App Download, Footers (3)
 * 
 * Total: 35 templates
 */
export const allPrebuiltTemplates = [
  ...heroTemplates,
  ...contentTemplates,
  ...featureTemplates,
  ...marketingTemplates,
  ...utilityTemplates,
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string) {
  return allPrebuiltTemplates.filter(t => t.category === category);
}

/**
 * Template categories with display names
 */
export const templateCategories = [
  { id: 'hero', name: 'Hero Sections', count: heroTemplates.length },
  { id: 'content', name: 'Content Blocks', count: contentTemplates.length + featureTemplates.length },
  { id: 'products', name: 'Services & Products', count: marketingTemplates.filter(t => t.category === 'products').length },
  { id: 'footer', name: 'Signatures & Footers', count: utilityTemplates.length },
];

/**
 * Create a pre-built template registry with all ReTurn Hypnosis branded templates
 */
export function createStandardPrebuiltRegistry() {
  const registry = createPrebuiltTemplateRegistry();

  // Register all templates
  allPrebuiltTemplates.forEach((template) => {
    registry.register(template);
  });

  return registry;
}

// Re-export registry creation function with a more descriptive name
export { createStandardPrebuiltRegistry as createPrebuiltRegistry };
