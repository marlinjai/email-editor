/**
 * @marlinjai/mail-contract: the v1 API contract of the mail service.
 *
 * The service, the SDK and the dashboard all import these schemas and types,
 * never their own copies. Runtime dependencies: zod only. No Node built-ins, so
 * everything here runs in Node, browsers and edge runtimes.
 */
export * from './common';
export * from './errors';
export * from './headers';
export * from './workspace';
export * from './templates';
export * from './providers';
export * from './contacts';
export * from './mailings';
export * from './webhooks';
export * from './webhook-signing';
export * from './unsubscribe';
export * from './platform';
export * from './billing';
export * from './routes';
