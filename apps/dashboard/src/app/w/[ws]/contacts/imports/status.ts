import type { ImportStatus } from '@marlinjai/mail-sdk';
import type { Tone } from '@/components/ui';

export const IMPORT_STATUS: Record<ImportStatus, { label: string; tone: Tone }> = {
  uploaded: { label: 'Needs mapping', tone: 'gold' },
  validating: { label: 'Checking', tone: 'gold' },
  validated: { label: 'Ready to import', tone: 'gold' },
  committing: { label: 'Importing', tone: 'gold' },
  completed: { label: 'Imported', tone: 'ok' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
