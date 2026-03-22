// Types
export type {
  AutomationStatus,
  TriggerType,
  EventTrigger,
  ScheduleTrigger,
  ManualTrigger,
  AutomationTrigger,
  StepType,
  SendEmailStep,
  WaitStep,
  ConditionBranch,
  ConditionRule,
  ConditionStep,
  SplitVariant,
  SplitStep,
  StepConfig,
  AutomationStep,
  Automation,
  EnrollmentStatus,
  Enrollment,
  WebhookEvent,
  AutomationStorageAdapter,
  CreateAutomationInput,
  UpdateAutomationInput,
  CreateStepInput,
  UpdateStepInput,
  CreateEnrollmentInput,
  UpdateEnrollmentInput,
  AutomationListOptions,
  EnrollmentListOptions,
} from './types';

// Schema
export { AUTOMATION_TABLES } from './schema';

// Condition evaluator
export {
  evaluateRule,
  evaluateBranch,
  evaluateCondition,
  type EvaluationContext,
} from './condition-evaluator';

// Engine
export { AutomationEngine } from './engine';
export type { AutomationEngineConfig } from './engine';

// Database adapter
export { DatabaseAutomationAdapter } from './adapter';
export type { DatabaseAutomationAdapterConfig } from './adapter';

// Components
export { SequenceBuilder, type SequenceBuilderProps } from './components/SequenceBuilder';
export { AutomationList, type AutomationListProps } from './components/AutomationList';
export { EnrollmentStatusView, type EnrollmentStatusProps } from './components/EnrollmentStatus';
