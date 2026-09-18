'use client';

import { useRouter } from 'next/navigation';
import { AUDIT_ACTIONS } from '@marlinjai/mail-contract';
import { Select } from '@/components/ui';

export function AuditFilter({ base, action }: { base: string; action: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-muted">
      Show
      <Select value={action} onChange={(e) => router.push(e.target.value ? `${base}?action=${e.target.value}` : base)} className="w-64">
        <option value="">every action</option>
        {AUDIT_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </Select>
    </label>
  );
}
