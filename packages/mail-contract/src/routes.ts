import { z } from 'zod';
import { IdParams, Ok, PageQuery, page } from './common';
import {
  ApiKey,
  ApiKeyCreate,
  ApiKeyCreated,
  AuditEntry,
  AuditQuery,
  Member,
  MemberCreate,
  MemberUpdate,
  Workspace,
  WorkspaceCreate,
  WorkspaceMembership,
  WorkspaceUpdate,
} from './workspace';
import {
  Asset,
  AssetImport,
  CompileRequest,
  CompileResult,
  Template,
  TemplateCompileRequest,
  TemplateCreate,
  TemplateListQuery,
  TemplateSummary,
  TemplateUpdate,
  TemplateVersion,
  TemplateVersionParams,
} from './templates';
import { Provider, ProviderCreate, ProviderUpdate, ProviderUsage, ProviderVerifyResult } from './providers';
import {
  Contact,
  ContactErased,
  ContactListQuery,
  ContactUpsert,
  ContactUpsertResult,
  Suppression,
  SuppressionCreate,
  SuppressionListQuery,
  Topic,
  TopicCreate,
  TopicUpdate,
} from './contacts';
import {
  Mailing,
  MailingActionRequest,
  MailingCreate,
  MailingListQuery,
  MailingRetryFailedRequest,
  MailingSendRequest,
  MailingSummary,
  MailingTestRequest,
  MailingTestResult,
  MailingUpdate,
  Message,
  MessageListQuery,
  MessageSummary,
  Recipient,
  RecipientBatch,
  RecipientBatchResult,
  RecipientListQuery,
} from './mailings';
import {
  WebhookDelivery,
  WebhookDeliveryListQuery,
  WebhookDeliveryParams,
  WebhookEndpoint,
  WebhookEndpointCreate,
  WebhookEndpointUpdate,
  WebhookEndpointWithSecret,
} from './webhooks';
import {
  AbTestConfig,
  AbWinnerRequest,
  ContactPropertyDefinition,
  ContactPropertyParams,
  ImportCommitRequest,
  ImportJob,
  ImportMappingRequest,
  ImportRow,
  ImportRowListQuery,
  MailingAnalytics,
  MailingAudienceFromSegment,
  MailingScheduleRequest,
  Segment,
  SegmentCreate,
  SegmentPreview,
  SegmentPreviewRequest,
  SignupForm,
  SignupFormCreate,
  SignupFormEmbed,
  SignupSubmission,
  Tag,
  TagAssignment,
  TagCreate,
  TrackingSettings,
} from './platform';
import { CheckoutRequest, CheckoutSession, Plan, PortalRequest, PortalSession, Subscription, Usage } from './billing';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * What a caller needs for a route.
 * - `read`: any API key scope; member role `viewer` or above.
 * - `write`: API key scope `send` or `full`; member role `editor` or above.
 * - `admin`: API key scope `full`; member role `admin` or above.
 * - `dashboard`: the dashboard service token plus `x-mail-subject`, no
 *   workspace yet (creating a workspace, listing the person's workspaces). A
 *   workspace API key is refused with `forbidden`.
 * - `public`: no credentials (hosted pages and signup submissions).
 */
export type RouteAccess = 'read' | 'write' | 'admin' | 'dashboard' | 'public';

export type Phase = 'S0' | 'S1' | 'S2' | 'S4' | 'S5';

export interface RouteDef {
  method: HttpMethod;
  /** Express-style path; `:name` segments are described by `params`. */
  path: `/v1/${string}`;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  /** JSON request body. Absent for GET and for bodiless actions. */
  body?: z.ZodTypeAny;
  /** A `multipart/form-data` upload instead of a JSON body. */
  multipart?: { fileField: string; jsonField?: string; json?: z.ZodTypeAny };
  response: z.ZodTypeAny;
  /** HTTP status of a success. */
  status: 200 | 201 | 202;
  access: RouteAccess;
  phase: Phase;
}

const list = <T extends z.ZodTypeAny>(item: T) => page(item);

// S0: foundation

export const foundationRoutes = {
  'workspaces.create': {
    method: 'POST',
    path: '/v1/workspaces',
    body: WorkspaceCreate,
    response: Workspace,
    status: 201,
    access: 'dashboard',
    phase: 'S0',
  },
  'workspaces.list': {
    method: 'GET',
    path: '/v1/workspaces',
    query: PageQuery,
    response: list(WorkspaceMembership),
    status: 200,
    access: 'dashboard',
    phase: 'S0',
  },
  'workspace.get': { method: 'GET', path: '/v1/workspace', response: Workspace, status: 200, access: 'read', phase: 'S0' },
  'workspace.update': {
    method: 'PATCH',
    path: '/v1/workspace',
    body: WorkspaceUpdate,
    response: Workspace,
    status: 200,
    access: 'admin',
    phase: 'S0',
  },
  'members.list': {
    method: 'GET',
    path: '/v1/members',
    query: PageQuery,
    response: list(Member),
    status: 200,
    access: 'read',
    phase: 'S0',
  },
  'members.add': {
    method: 'POST',
    path: '/v1/members',
    body: MemberCreate,
    response: Member,
    status: 201,
    access: 'admin',
    phase: 'S0',
  },
  'members.update': {
    method: 'PATCH',
    path: '/v1/members/:id',
    params: IdParams,
    body: MemberUpdate,
    response: Member,
    status: 200,
    access: 'admin',
    phase: 'S0',
  },
  'members.remove': {
    method: 'DELETE',
    path: '/v1/members/:id',
    params: IdParams,
    response: Ok,
    status: 200,
    access: 'admin',
    phase: 'S0',
  },
  'apiKeys.list': {
    method: 'GET',
    path: '/v1/api-keys',
    query: PageQuery,
    response: list(ApiKey),
    status: 200,
    access: 'admin',
    phase: 'S0',
  },
  'apiKeys.create': {
    method: 'POST',
    path: '/v1/api-keys',
    body: ApiKeyCreate,
    response: ApiKeyCreated,
    status: 201,
    access: 'admin',
    phase: 'S0',
  },
  'apiKeys.revoke': {
    method: 'DELETE',
    path: '/v1/api-keys/:id',
    params: IdParams,
    response: ApiKey,
    status: 200,
    access: 'admin',
    phase: 'S0',
  },
  'audit.list': {
    method: 'GET',
    path: '/v1/audit-log',
    query: AuditQuery,
    response: list(AuditEntry),
    status: 200,
    access: 'admin',
    phase: 'S0',
  },
} as const satisfies Record<string, RouteDef>;

// S1: editor and templates

export const templateRoutes = {
  'templates.list': {
    method: 'GET',
    path: '/v1/templates',
    query: TemplateListQuery,
    response: list(TemplateSummary),
    status: 200,
    access: 'read',
    phase: 'S1',
  },
  'templates.create': {
    method: 'POST',
    path: '/v1/templates',
    body: TemplateCreate,
    response: Template,
    status: 201,
    access: 'write',
    phase: 'S1',
  },
  'templates.get': {
    method: 'GET',
    path: '/v1/templates/:id',
    params: IdParams,
    response: Template,
    status: 200,
    access: 'read',
    phase: 'S1',
  },
  'templates.update': {
    method: 'PUT',
    path: '/v1/templates/:id',
    params: IdParams,
    body: TemplateUpdate,
    response: Template,
    status: 200,
    access: 'write',
    phase: 'S1',
  },
  'templates.delete': {
    method: 'DELETE',
    path: '/v1/templates/:id',
    params: IdParams,
    response: Ok,
    status: 200,
    access: 'write',
    phase: 'S1',
  },
  'templates.versions': {
    method: 'GET',
    path: '/v1/templates/:id/versions',
    params: IdParams,
    query: PageQuery,
    response: list(TemplateVersion),
    status: 200,
    access: 'read',
    phase: 'S1',
  },
  'templates.version': {
    method: 'GET',
    path: '/v1/templates/:id/versions/:version',
    params: TemplateVersionParams,
    response: TemplateVersion,
    status: 200,
    access: 'read',
    phase: 'S1',
  },
  'templates.compile': {
    method: 'POST',
    path: '/v1/templates/:id/compile',
    params: IdParams,
    body: TemplateCompileRequest,
    response: CompileResult,
    status: 200,
    access: 'read',
    phase: 'S1',
  },
  compile: {
    method: 'POST',
    path: '/v1/compile',
    body: CompileRequest,
    response: CompileResult,
    status: 200,
    access: 'read',
    phase: 'S1',
  },
  'assets.upload': {
    method: 'POST',
    path: '/v1/assets',
    multipart: { fileField: 'file' },
    response: Asset,
    status: 201,
    access: 'write',
    phase: 'S1',
  },
  'assets.import': {
    method: 'POST',
    path: '/v1/assets/import',
    body: AssetImport,
    response: Asset,
    status: 201,
    access: 'write',
    phase: 'S1',
  },
  'assets.get': {
    method: 'GET',
    path: '/v1/assets/:id',
    params: IdParams,
    response: Asset,
    status: 200,
    access: 'read',
    phase: 'S1',
  },
} as const satisfies Record<string, RouteDef>;

// S2: sending

export const sendingRoutes = {
  'providers.list': {
    method: 'GET',
    path: '/v1/providers',
    query: PageQuery,
    response: list(Provider),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'providers.create': {
    method: 'POST',
    path: '/v1/providers',
    body: ProviderCreate,
    response: Provider,
    status: 201,
    access: 'admin',
    phase: 'S2',
  },
  'providers.get': {
    method: 'GET',
    path: '/v1/providers/:id',
    params: IdParams,
    response: Provider,
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'providers.update': {
    method: 'PATCH',
    path: '/v1/providers/:id',
    params: IdParams,
    body: ProviderUpdate,
    response: Provider,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'providers.delete': {
    method: 'DELETE',
    path: '/v1/providers/:id',
    params: IdParams,
    response: Ok,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'providers.verify': {
    method: 'POST',
    path: '/v1/providers/:id/verify',
    params: IdParams,
    response: ProviderVerifyResult,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'providers.usage': {
    method: 'GET',
    path: '/v1/providers/:id/usage',
    params: IdParams,
    response: ProviderUsage,
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'topics.list': {
    method: 'GET',
    path: '/v1/topics',
    query: PageQuery,
    response: list(Topic),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'topics.create': {
    method: 'POST',
    path: '/v1/topics',
    body: TopicCreate,
    response: Topic,
    status: 201,
    access: 'admin',
    phase: 'S2',
  },
  'topics.update': {
    method: 'PATCH',
    path: '/v1/topics/:id',
    params: IdParams,
    body: TopicUpdate,
    response: Topic,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'contacts.upsert': {
    method: 'POST',
    path: '/v1/contacts',
    body: ContactUpsert,
    response: ContactUpsertResult,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'contacts.list': {
    method: 'GET',
    path: '/v1/contacts',
    query: ContactListQuery,
    response: list(Contact),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'contacts.get': {
    method: 'GET',
    path: '/v1/contacts/:id',
    params: IdParams,
    response: Contact,
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'contacts.erase': {
    method: 'DELETE',
    path: '/v1/contacts/:id',
    params: IdParams,
    response: ContactErased,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'contacts.messages': {
    method: 'GET',
    path: '/v1/contacts/:id/messages',
    params: IdParams,
    query: PageQuery,
    response: list(MessageSummary),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'suppressions.list': {
    method: 'GET',
    path: '/v1/suppressions',
    query: SuppressionListQuery,
    response: list(Suppression),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'suppressions.create': {
    method: 'POST',
    path: '/v1/suppressions',
    body: SuppressionCreate,
    response: Suppression,
    status: 201,
    access: 'write',
    phase: 'S2',
  },
  'suppressions.delete': {
    method: 'DELETE',
    path: '/v1/suppressions/:id',
    params: IdParams,
    response: Ok,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'mailings.list': {
    method: 'GET',
    path: '/v1/mailings',
    query: MailingListQuery,
    response: list(MailingSummary),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'mailings.create': {
    method: 'POST',
    path: '/v1/mailings',
    body: MailingCreate,
    response: Mailing,
    status: 201,
    access: 'write',
    phase: 'S2',
  },
  'mailings.get': {
    method: 'GET',
    path: '/v1/mailings/:id',
    params: IdParams,
    response: Mailing,
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'mailings.update': {
    method: 'PATCH',
    path: '/v1/mailings/:id',
    params: IdParams,
    body: MailingUpdate,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'mailings.addRecipients': {
    method: 'POST',
    path: '/v1/mailings/:id/recipients',
    params: IdParams,
    body: RecipientBatch,
    response: RecipientBatchResult,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'mailings.listRecipients': {
    method: 'GET',
    path: '/v1/mailings/:id/recipients',
    params: IdParams,
    query: RecipientListQuery,
    response: list(Recipient),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'mailings.test': {
    method: 'POST',
    path: '/v1/mailings/:id/test',
    params: IdParams,
    body: MailingTestRequest,
    response: MailingTestResult,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'mailings.send': {
    method: 'POST',
    path: '/v1/mailings/:id/send',
    params: IdParams,
    body: MailingSendRequest,
    response: Mailing,
    status: 202,
    access: 'write',
    phase: 'S2',
  },
  'mailings.pause': {
    method: 'POST',
    path: '/v1/mailings/:id/pause',
    params: IdParams,
    body: MailingActionRequest,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'mailings.resume': {
    method: 'POST',
    path: '/v1/mailings/:id/resume',
    params: IdParams,
    body: MailingActionRequest,
    response: Mailing,
    status: 202,
    access: 'write',
    phase: 'S2',
  },
  'mailings.cancel': {
    method: 'POST',
    path: '/v1/mailings/:id/cancel',
    params: IdParams,
    body: MailingActionRequest,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S2',
  },
  'mailings.retryFailed': {
    method: 'POST',
    path: '/v1/mailings/:id/retry-failed',
    params: IdParams,
    body: MailingRetryFailedRequest,
    response: Mailing,
    status: 202,
    access: 'write',
    phase: 'S2',
  },
  /** Copies any mailing, in any state, into a new `draft` with the same content, topic and provider (no recipients). */
  'mailings.duplicate': {
    method: 'POST',
    path: '/v1/mailings/:id/duplicate',
    params: IdParams,
    body: MailingActionRequest,
    response: Mailing,
    status: 201,
    access: 'write',
    phase: 'S2',
  },
  'messages.list': {
    method: 'GET',
    path: '/v1/messages',
    query: MessageListQuery,
    response: list(MessageSummary),
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'messages.get': {
    method: 'GET',
    path: '/v1/messages/:id',
    params: IdParams,
    response: Message,
    status: 200,
    access: 'read',
    phase: 'S2',
  },
  'webhooks.list': {
    method: 'GET',
    path: '/v1/webhooks',
    query: PageQuery,
    response: list(WebhookEndpoint),
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.create': {
    method: 'POST',
    path: '/v1/webhooks',
    body: WebhookEndpointCreate,
    response: WebhookEndpointWithSecret,
    status: 201,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.get': {
    method: 'GET',
    path: '/v1/webhooks/:id',
    params: IdParams,
    response: WebhookEndpoint,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.update': {
    method: 'PATCH',
    path: '/v1/webhooks/:id',
    params: IdParams,
    body: WebhookEndpointUpdate,
    response: WebhookEndpoint,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.delete': {
    method: 'DELETE',
    path: '/v1/webhooks/:id',
    params: IdParams,
    response: Ok,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.rotateSecret': {
    method: 'POST',
    path: '/v1/webhooks/:id/rotate-secret',
    params: IdParams,
    response: WebhookEndpointWithSecret,
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.deliveries': {
    method: 'GET',
    path: '/v1/webhooks/:id/deliveries',
    params: IdParams,
    query: WebhookDeliveryListQuery,
    response: list(WebhookDelivery),
    status: 200,
    access: 'admin',
    phase: 'S2',
  },
  'webhooks.redeliver': {
    method: 'POST',
    path: '/v1/webhooks/:id/deliveries/:delivery_id/redeliver',
    params: WebhookDeliveryParams,
    response: WebhookDelivery,
    status: 202,
    access: 'admin',
    phase: 'S2',
  },
} as const satisfies Record<string, RouteDef>;

// S4: platform features

export const platformRoutes = {
  'tags.list': { method: 'GET', path: '/v1/tags', query: PageQuery, response: list(Tag), status: 200, access: 'read', phase: 'S4' },
  'tags.create': { method: 'POST', path: '/v1/tags', body: TagCreate, response: Tag, status: 201, access: 'write', phase: 'S4' },
  /** Deleting a tag takes it off every contact; segments that name it then match nobody for it. */
  'tags.delete': { method: 'DELETE', path: '/v1/tags/:id', params: IdParams, response: Ok, status: 200, access: 'write', phase: 'S4' },
  'tags.assign': {
    method: 'POST',
    path: '/v1/tags/:id/contacts',
    params: IdParams,
    body: TagAssignment,
    response: Tag,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'tags.unassign': {
    method: 'DELETE',
    path: '/v1/tags/:id/contacts',
    params: IdParams,
    body: TagAssignment,
    response: Tag,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'contactProperties.list': {
    method: 'GET',
    path: '/v1/contact-properties',
    response: z.object({ data: z.array(ContactPropertyDefinition) }),
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  /** Defining a key refuses when a stored value of an existing contact has another type (`conflict`, with examples). */
  'contactProperties.create': {
    method: 'POST',
    path: '/v1/contact-properties',
    body: ContactPropertyDefinition,
    response: ContactPropertyDefinition,
    status: 201,
    access: 'admin',
    phase: 'S4',
  },
  /** Removes the definition only; stored values stay and become free-form again. */
  'contactProperties.delete': {
    method: 'DELETE',
    path: '/v1/contact-properties/:key',
    params: ContactPropertyParams,
    response: Ok,
    status: 200,
    access: 'admin',
    phase: 'S4',
  },
  'segments.list': {
    method: 'GET',
    path: '/v1/segments',
    query: PageQuery,
    response: list(Segment),
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'segments.create': {
    method: 'POST',
    path: '/v1/segments',
    body: SegmentCreate,
    response: Segment,
    status: 201,
    access: 'write',
    phase: 'S4',
  },
  /** Counts what a filter matches without saving it. */
  'segments.preview': {
    method: 'POST',
    path: '/v1/segments/preview',
    body: SegmentPreviewRequest,
    response: SegmentPreview,
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'segments.get': { method: 'GET', path: '/v1/segments/:id', params: IdParams, response: Segment, status: 200, access: 'read', phase: 'S4' },
  'segments.update': {
    method: 'PUT',
    path: '/v1/segments/:id',
    params: IdParams,
    body: SegmentCreate,
    response: Segment,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'segments.delete': { method: 'DELETE', path: '/v1/segments/:id', params: IdParams, response: Ok, status: 200, access: 'write', phase: 'S4' },
  'mailings.addSegment': {
    method: 'POST',
    path: '/v1/mailings/:id/recipients/segment',
    params: IdParams,
    body: MailingAudienceFromSegment,
    response: RecipientBatchResult,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'mailings.schedule': {
    method: 'POST',
    path: '/v1/mailings/:id/schedule',
    params: IdParams,
    body: MailingScheduleRequest,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  /** A `scheduled` mailing back to `draft`. */
  'mailings.unschedule': {
    method: 'POST',
    path: '/v1/mailings/:id/unschedule',
    params: IdParams,
    body: MailingActionRequest,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  /** Sets or replaces the A/B test of a `draft` or `scheduled` mailing. */
  'mailings.setAbTest': {
    method: 'PUT',
    path: '/v1/mailings/:id/ab-test',
    params: IdParams,
    body: AbTestConfig,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'mailings.clearAbTest': {
    method: 'DELETE',
    path: '/v1/mailings/:id/ab-test',
    params: IdParams,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  /** Picks the winner of a running test by hand; the held recipients get it. */
  'mailings.pickAbWinner': {
    method: 'POST',
    path: '/v1/mailings/:id/ab-test/winner',
    params: IdParams,
    body: AbWinnerRequest,
    response: Mailing,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'mailings.analytics': {
    method: 'GET',
    path: '/v1/mailings/:id/analytics',
    params: IdParams,
    response: MailingAnalytics,
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'signupForms.list': {
    method: 'GET',
    path: '/v1/signup-forms',
    query: PageQuery,
    response: list(SignupForm),
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'signupForms.create': {
    method: 'POST',
    path: '/v1/signup-forms',
    body: SignupFormCreate,
    response: SignupForm,
    status: 201,
    access: 'admin',
    phase: 'S4',
  },
  'signupForms.get': {
    method: 'GET',
    path: '/v1/signup-forms/:id',
    params: IdParams,
    response: SignupForm,
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'signupForms.update': {
    method: 'PUT',
    path: '/v1/signup-forms/:id',
    params: IdParams,
    body: SignupFormCreate,
    response: SignupForm,
    status: 200,
    access: 'admin',
    phase: 'S4',
  },
  /** Pending confirmations of a deleted form stop working; confirmed subscriptions stay. */
  'signupForms.delete': {
    method: 'DELETE',
    path: '/v1/signup-forms/:id',
    params: IdParams,
    response: Ok,
    status: 200,
    access: 'admin',
    phase: 'S4',
  },
  'signupForms.embed': {
    method: 'GET',
    path: '/v1/signup-forms/:id/embed',
    params: IdParams,
    response: SignupFormEmbed,
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  /**
   * The public submission, as JSON (the optional embed script and custom
   * frontends). Answers 202 for every accepted-looking submission, whatever
   * happens next, so it discloses nobody's membership.
   */
  'signupForms.submit': {
    method: 'POST',
    path: '/v1/signup-forms/:id/submit',
    params: IdParams,
    body: SignupSubmission,
    response: Ok,
    status: 202,
    access: 'public',
    phase: 'S4',
  },
  /** Uploads the CSV (`file` field, UTF-8, comma or semicolon separated, a header row). */
  'imports.create': {
    method: 'POST',
    path: '/v1/imports',
    multipart: { fileField: 'file' },
    response: ImportJob,
    status: 201,
    access: 'write',
    phase: 'S4',
  },
  'imports.list': {
    method: 'GET',
    path: '/v1/imports',
    query: PageQuery,
    response: list(ImportJob),
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'imports.get': { method: 'GET', path: '/v1/imports/:id', params: IdParams, response: ImportJob, status: 200, access: 'read', phase: 'S4' },
  /** Sets or revises the mapping and starts its dry run (a revision discards the previous dry run). */
  'imports.setMapping': {
    method: 'PUT',
    path: '/v1/imports/:id/mapping',
    params: IdParams,
    body: ImportMappingRequest,
    response: ImportJob,
    status: 202,
    access: 'write',
    phase: 'S4',
  },
  'imports.commit': {
    method: 'POST',
    path: '/v1/imports/:id/commit',
    params: IdParams,
    body: ImportCommitRequest,
    response: ImportJob,
    status: 202,
    access: 'write',
    phase: 'S4',
  },
  'imports.cancel': {
    method: 'POST',
    path: '/v1/imports/:id/cancel',
    params: IdParams,
    body: MailingActionRequest,
    response: ImportJob,
    status: 200,
    access: 'write',
    phase: 'S4',
  },
  'imports.rows': {
    method: 'GET',
    path: '/v1/imports/:id/rows',
    params: IdParams,
    query: ImportRowListQuery,
    response: list(ImportRow),
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'tracking.get': {
    method: 'GET',
    path: '/v1/workspace/tracking',
    response: TrackingSettings,
    status: 200,
    access: 'read',
    phase: 'S4',
  },
  'tracking.update': {
    method: 'PUT',
    path: '/v1/workspace/tracking',
    body: TrackingSettings,
    response: TrackingSettings,
    status: 200,
    access: 'admin',
    phase: 'S4',
  },
} as const satisfies Record<string, RouteDef>;

// S5: billing

export const billingRoutes = {
  'billing.plans': {
    method: 'GET',
    path: '/v1/billing/plans',
    response: z.object({ data: z.array(Plan) }),
    status: 200,
    access: 'read',
    phase: 'S5',
  },
  'billing.subscription': {
    method: 'GET',
    path: '/v1/billing/subscription',
    response: Subscription,
    status: 200,
    access: 'admin',
    phase: 'S5',
  },
  'billing.usage': { method: 'GET', path: '/v1/billing/usage', response: Usage, status: 200, access: 'read', phase: 'S5' },
  'billing.checkout': {
    method: 'POST',
    path: '/v1/billing/checkout',
    body: CheckoutRequest,
    response: CheckoutSession,
    status: 200,
    access: 'admin',
    phase: 'S5',
  },
  'billing.portal': {
    method: 'POST',
    path: '/v1/billing/portal',
    body: PortalRequest,
    response: PortalSession,
    status: 200,
    access: 'admin',
    phase: 'S5',
  },
} as const satisfies Record<string, RouteDef>;

/** Every v1 operation, keyed by operation id. */
export const routes = {
  ...foundationRoutes,
  ...templateRoutes,
  ...sendingRoutes,
  ...platformRoutes,
  ...billingRoutes,
} as const satisfies Record<string, RouteDef>;

export type Routes = typeof routes;
export type OperationId = keyof Routes;

type Infer<T> = T extends z.ZodTypeAny ? z.infer<T> : undefined;
export type RouteParams<K extends OperationId> = Routes[K] extends { params: infer P } ? Infer<P> : undefined;
export type RouteQuery<K extends OperationId> = Routes[K] extends { query: infer Q } ? z.input<Q & z.ZodTypeAny> : undefined;
export type RouteBody<K extends OperationId> = Routes[K] extends { body: infer B } ? Infer<B> : undefined;
export type RouteResponse<K extends OperationId> = Infer<Routes[K]['response']>;

/**
 * Every mutating call accepts an `Idempotency-Key`; reads never need one. The
 * SDK sends a key on every non-GET request so a retry after a network failure can
 * never apply twice.
 */
export function acceptsIdempotencyKey(route: RouteDef): boolean {
  return route.method !== 'GET';
}

/** Fills the `:name` segments of a route path, URL-encoding each value. */
export function buildPath(path: string, params: Record<string, string | number> = {}): string {
  return path.replace(/:([a-z_]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === '') throw new Error(`missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(String(value));
  });
}

/** Finds the operation for a method and a concrete path, e.g. for logging. */
export function matchRoute(method: HttpMethod, pathname: string): { id: OperationId; params: Record<string, string> } | null {
  for (const [id, route] of Object.entries(routes) as [OperationId, RouteDef][]) {
    if (route.method !== method) continue;
    const names: string[] = [];
    const pattern = new RegExp(
      '^' +
        route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:([a-z_]+)/g, (_, name: string) => {
          names.push(name);
          return '([^/]+)';
        }) +
        '$',
    );
    const match = pattern.exec(pathname);
    if (!match) continue;
    const params: Record<string, string> = {};
    names.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]!);
    });
    return { id, params };
  }
  return null;
}
