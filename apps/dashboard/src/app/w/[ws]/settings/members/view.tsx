'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MEMBER_ROLES, type Invite, type InviteStatus, type Member, type MemberRole } from '@marlinjai/mail-contract';
import type { ActionResult } from '@/lib/result';
import { ConfirmDialog } from '@/components/dialog';
import { FormError } from '@/components/form-error';
import { Badge, Button, describedBy, EmptyState, ErrorPanel, Field, Input, Notice, Section, Select, Table, Td, Th, When } from '@/components/ui';
import { useAction } from '@/components/use-action';
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import { changeRole, inviteMember, removeMember, revokeInvite } from '../actions';

function RoleSelect({ ws, member, myRole }: { ws: string; member: Member; myRole: MemberRole }) {
  const { run, pending, error } = useAction();
  const [value, setValue] = useState(member.role);
  // Only an owner grants or takes away the owner role; the service enforces it too.
  const options = MEMBER_ROLES.filter((r) => myRole === 'owner' || (r !== 'owner' && member.role !== 'owner'));
  const locked = member.role === 'owner' && myRole !== 'owner';
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={`Role of ${member.email}`}
        value={value}
        disabled={pending || locked}
        className="h-8 w-32"
        onChange={(e) => {
          const next = e.target.value as MemberRole;
          const previous = value;
          setValue(next);
          void run(() => changeRole(ws, member.id, next)).then((r) => {
            if (!r.ok) setValue(previous);
          });
        }}
      >
        {(locked ? [member.role] : options).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      {error ? (
        <span role="alert" className="text-[12px] text-danger">
          {error.message}
        </span>
      ) : null}
    </div>
  );
}

function InviteForm({ ws, myRole }: { ws: string; myRole: MemberRole }) {
  const router = useRouter();
  const { run, pending, error, fields } = useAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [link, setLink] = useState<{ url: string; expiresAt: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setCopied(false);
          void run(
            () => inviteMember(ws, { email, role }),
            (r) => {
              setLink({ ...r, email });
              setEmail('');
              router.refresh();
            },
          );
        }}
      >
        <Field id="inv-email" label="Email address" error={fields.email} className="min-w-[240px] flex-1">
          <Input
            {...describedBy('inv-email', fields.email)}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
          />
        </Field>
        <Field id="inv-role" label="Role" error={fields.role} className="w-40">
          <Select {...describedBy('inv-role', fields.role)} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
            {MEMBER_ROLES.filter((r) => r !== 'owner' || myRole === 'owner').map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="primary" busy={pending}>
          Create invitation
        </Button>
      </form>
      <p className="text-[12.5px] text-faint">{ROLE_DESCRIPTIONS[role]}</p>
      <FormError error={error && !error.fields ? error : null} />
      {link ? (
        <Notice tone="gold">
          <p className="text-ink">
            Send this link to <span className="font-medium">{link.email}</span>. It works once they sign in with that address, until{' '}
            <When at={link.expiresAt} />.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code data-testid="invite-link" className="min-w-0 flex-1 truncate rounded-md bg-bg px-2 py-1.5 font-mono text-[12px] text-ink">
              {link.url}
            </code>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Their company needs Lumitra Mail enabled in their Lumitra account for the link to open.
          </p>
        </Notice>
      ) : null}
    </div>
  );
}

const INVITE_TONE: Record<InviteStatus, 'gold' | 'ok' | 'neutral'> = { pending: 'gold', accepted: 'ok', revoked: 'neutral', expired: 'neutral' };

function Invitations({ ws, invites }: { ws: string; invites: ActionResult<Invite[]> }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<Invite | null>(null);
  if (!invites.ok) return <ErrorPanel title="Invitations could not be loaded" message={invites.error.message} requestId={invites.error.requestId} />;
  if (invites.data.length === 0) return <EmptyState title="No invitations yet">Invitations you create appear here until they are used, withdrawn or expire.</EmptyState>;
  return (
    <>
      <Table label="Invitations">
        <thead>
          <tr>
            <Th>Address</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Invited by</Th>
            <Th>Expires</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {invites.data.map((i) => (
            <tr key={i.id}>
              <Td>{i.email}</Td>
              <Td className="text-muted">{ROLE_LABELS[i.role]}</Td>
              <Td>
                <Badge tone={INVITE_TONE[i.status]}>{i.status}</Badge>
              </Td>
              <Td className="text-muted">{i.invited_by.email ?? 'a former member'}</Td>
              <Td>
                <When at={i.expires_at} />
              </Td>
              <Td className="text-right">
                {i.status === 'pending' ? (
                  <Button variant="ghost" onClick={() => setRevoking(i)}>
                    Revoke
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Withdraw the invitation to ${revoking?.email ?? ''}?`}
        description="The link stops working at once. You can invite the address again afterwards."
        confirmLabel="Revoke invitation"
        action={() => revokeInvite(ws, revoking!.id)}
        onDone={() => router.refresh()}
      />
    </>
  );
}

export function MembersView({
  ws,
  members,
  me,
  myRole,
  invites,
}: {
  ws: string;
  members: Member[];
  me: string;
  myRole: MemberRole;
  invites: ActionResult<Invite[]> | null;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState<Member | null>(null);
  const isAdmin = can(myRole, 'admin');
  return (
    <>
      <Section title="People" description="Everyone who can open this workspace, and what they may do in it.">
        <Table label="Members">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
              <Th className="text-right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const self = m.subject === me;
              return (
                <tr key={m.id}>
                  <Td>
                    <span className="block text-ink">{m.name ?? m.email}</span>
                    {m.name ? <span className="block text-[12px] text-muted">{m.email}</span> : null}
                    {self ? <Badge tone="gold">You</Badge> : null}
                  </Td>
                  <Td>
                    {isAdmin && !self ? (
                      <RoleSelect ws={ws} member={m} myRole={myRole} />
                    ) : (
                      <span className="text-muted">{ROLE_LABELS[m.role]}</span>
                    )}
                  </Td>
                  <Td>
                    <When at={m.created_at} />
                  </Td>
                  <Td className="text-right">
                    {self || isAdmin ? (
                      <Button variant="ghost" onClick={() => setRemoving(m)}>
                        {self ? 'Leave' : 'Remove'}
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Section>
      {isAdmin ? (
        <Section
          title="Invite someone"
          description="Creates a link for one address and role, valid for seven days. You send it; nothing is emailed automatically."
        >
          <InviteForm ws={ws} myRole={myRole} />
        </Section>
      ) : null}
      {invites ? (
        <Section title="Invitations" description="Pending ones can be withdrawn; a link works once, for the invited address only.">
          <Invitations ws={ws} invites={invites} />
        </Section>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing?.subject === me ? 'Leave this workspace?' : `Remove ${removing?.email ?? ''}?`}
        description={
          removing?.subject === me
            ? 'You lose access immediately. Someone with the admin role can invite you again.'
            : 'They lose access immediately. Their past changes stay in the audit log.'
        }
        confirmLabel={removing?.subject === me ? 'Leave workspace' : 'Remove member'}
        action={() => removeMember(ws, removing!.id)}
        onDone={() => (removing?.subject === me ? router.push('/') : router.refresh())}
      />
    </>
  );
}
