// packages/blocks/src/registry.ts
// Register all standard blocks

import { createBlockRegistry } from '@returnhypnosis/email-editor-core';
import { textBlockDefinition } from './text';
import { imageBlockDefinition } from './image';
import { buttonBlockDefinition } from './button';
import { dividerBlockDefinition } from './divider';
import { spacerBlockDefinition } from './spacer';
import { headerBlockDefinition, footerBlockDefinition } from './branded';

/**
 * Create a registry with all standard blocks pre-registered
 */
export function createStandardBlockRegistry() {
  const registry = createBlockRegistry();

  // Register standard blocks
  registry.register(textBlockDefinition);
  registry.register(imageBlockDefinition);
  registry.register(buttonBlockDefinition);
  registry.register(dividerBlockDefinition);
  registry.register(spacerBlockDefinition);
  
  // Register branded blocks
  registry.register(headerBlockDefinition);
  registry.register(footerBlockDefinition);

  return registry;
}

