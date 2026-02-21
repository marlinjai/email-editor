// packages/blocks/src/registry.ts
// Register all standard blocks

import { createBlockRegistry } from '@marlinjai/email-editor-core';
import { textBlockDefinition } from './text';
import { imageBlockDefinition } from './image';
import { buttonBlockDefinition } from './button';
import { dividerBlockDefinition } from './divider';
import { spacerBlockDefinition } from './spacer';
import { socialBlockDefinition } from './social';
import { heroBlockDefinition } from './hero';
import { accordionBlockDefinition } from './accordion';
import { rawBlockDefinition } from './raw';
import { navbarBlockDefinition } from './navbar';
import { carouselBlockDefinition } from './carousel';
import { tableBlockDefinition } from './table';
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
  registry.register(socialBlockDefinition);
  registry.register(heroBlockDefinition);
  registry.register(accordionBlockDefinition);
  registry.register(rawBlockDefinition);
  
  // Register new MJML components
  registry.register(navbarBlockDefinition);
  registry.register(carouselBlockDefinition);
  registry.register(tableBlockDefinition);
  
  // Register branded blocks
  registry.register(headerBlockDefinition);
  registry.register(footerBlockDefinition);

  return registry;
}

