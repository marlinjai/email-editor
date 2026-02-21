'use client';

import { TemplateDashboard } from '@marlinjai/email-templates';

// Mock template data for UI shell
const MOCK_TEMPLATES = [
  {
    id: 't1',
    name: 'Welcome Email',
    subject: 'Welcome aboard!',
    status: 'active' as const,
    category: 'Transactional',
    version: 1,
    thumbnailUrl: undefined,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-02-10T14:30:00Z',
  },
  {
    id: 't2',
    name: 'Monthly Newsletter',
    subject: 'Your February Update',
    status: 'active' as const,
    category: 'Newsletter',
    version: 3,
    thumbnailUrl: undefined,
    createdAt: '2025-12-01T09:00:00Z',
    updatedAt: '2026-02-18T16:00:00Z',
  },
  {
    id: 't3',
    name: 'Product Launch',
    subject: 'Introducing our new feature',
    status: 'draft' as const,
    category: 'Marketing',
    version: 1,
    thumbnailUrl: undefined,
    createdAt: '2026-02-20T11:00:00Z',
    updatedAt: '2026-02-20T11:00:00Z',
  },
  {
    id: 't4',
    name: 'Holiday Promo 2025',
    subject: 'Holiday savings just for you',
    status: 'archived' as const,
    category: 'Marketing',
    version: 2,
    thumbnailUrl: undefined,
    createdAt: '2025-11-20T08:00:00Z',
    updatedAt: '2025-12-26T10:00:00Z',
  },
];

export default function TemplatesPage() {
  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Templates</h1>
        <p>Manage your email templates</p>
      </div>
      <div className="dashboard-section">
        <TemplateDashboard
          templates={MOCK_TEMPLATES}
          total={MOCK_TEMPLATES.length}
          onCreateNew={() => window.location.href = '/editor'}
          onEdit={() => window.location.href = '/editor'}
        />
      </div>
    </div>
  );
}
