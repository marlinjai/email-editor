// packages/core/src/index.ts
// Core email editor engine - framework agnostic
// CLIENT-SAFE: Does not include server-only MJML compiler

export * from './schema';
export * from './registry';
export * from './history';
export * from './selection';
export * from './templates';
export * from './store';

// Note: Import compiler separately from '@marlinjai/email-editor-core/server' for server-side use

