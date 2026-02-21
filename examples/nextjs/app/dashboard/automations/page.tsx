'use client';

import { AutomationList } from '@marlinjai/email-automation';
import type { Automation, AutomationListOptions } from '@marlinjai/email-automation';
import { useState, useCallback } from 'react';

const MOCK_AUTOMATIONS: Automation[] = [
  {
    id: 'auto-1',
    name: 'Welcome Sequence',
    description: 'Onboard new subscribers with a 3-email drip campaign',
    status: 'active',
    trigger: { type: 'event', eventName: 'signup' },
    entryStepId: 'step-1',
    totalEnrolled: 1248,
    totalCompleted: 987,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-02-20T14:30:00Z',
  },
  {
    id: 'auto-2',
    name: 'Re-engagement Campaign',
    description: 'Win back contacts who have not opened in 30 days',
    status: 'paused',
    trigger: { type: 'schedule', scheduleType: 'recurring', cronExpression: '0 9 * * 1' },
    entryStepId: 'step-10',
    totalEnrolled: 342,
    totalCompleted: 156,
    createdAt: '2026-02-01T08:00:00Z',
    updatedAt: '2026-02-18T16:00:00Z',
  },
  {
    id: 'auto-3',
    name: 'Post-Purchase Follow-up',
    description: 'Thank customers and request a review after purchase',
    status: 'active',
    trigger: { type: 'event', eventName: 'purchase' },
    entryStepId: 'step-20',
    totalEnrolled: 567,
    totalCompleted: 489,
    createdAt: '2026-01-20T12:00:00Z',
    updatedAt: '2026-02-21T09:00:00Z',
  },
  {
    id: 'auto-4',
    name: 'Birthday Email',
    description: 'Send a birthday discount code',
    status: 'draft',
    trigger: { type: 'schedule', scheduleType: 'recurring', cronExpression: '0 8 * * *' },
    totalEnrolled: 0,
    totalCompleted: 0,
    createdAt: '2026-02-21T11:00:00Z',
    updatedAt: '2026-02-21T11:00:00Z',
  },
];

export default function AutomationsPage() {
  const [automations, setAutomations] = useState(MOCK_AUTOMATIONS);
  const [filters, setFilters] = useState<AutomationListOptions>({});

  const filtered = useCallback(() => {
    let data = [...automations];
    if (filters.status) {
      data = data.filter((a) => a.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      data = data.filter((a) => a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q));
    }
    return data;
  }, [automations, filters]);

  const handleActivate = (automation: Automation) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === automation.id ? { ...a, status: 'active' as const, updatedAt: new Date().toISOString() } : a))
    );
  };

  const handlePause = (automation: Automation) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === automation.id ? { ...a, status: 'paused' as const, updatedAt: new Date().toISOString() } : a))
    );
  };

  const handleDelete = (automation: Automation) => {
    setAutomations((prev) => prev.filter((a) => a.id !== automation.id));
  };

  const data = filtered();

  return (
    <div>
      <div className="dashboard-page-header">
        <h1>Automations</h1>
        <p>Build trigger-based email sequences and workflows</p>
      </div>
      <div className="dashboard-section">
        <AutomationList
          automations={data}
          total={data.length}
          onFiltersChange={setFilters}
          onCreateNew={() => alert('Create automation flow coming soon')}
          onEdit={(a) => alert(`Edit automation: ${a.name}`)}
          onActivate={handleActivate}
          onPause={handlePause}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
