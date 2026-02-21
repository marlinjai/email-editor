// React components for contacts package
export { ContactList } from './components/ContactList';
export type { ContactListProps } from './components/ContactList';

export { ContactDetail } from './components/ContactDetail';
export type { ContactDetailProps } from './components/ContactDetail';

export { SegmentBuilder } from './components/SegmentBuilder';
export type { SegmentBuilderProps } from './components/SegmentBuilder';

export { ContactImporter } from './components/ContactImporter';
export type { ContactImporterProps } from './components/ContactImporter';

// Re-export core types for convenience
export type {
  Contact,
  ContactStatus,
  ContactListOptions,
  ContactStorageAdapter,
  CreateContactInput,
  UpdateContactInput,
  Segment,
  SegmentRule,
  SegmentOperator,
  SegmentGroup,
  CSVFieldMapping,
  CSVImportResult,
} from './types';
