import React, { useState, useCallback } from 'react';
import type { Contact, ContactStatus, ContactStorageAdapter, ContactListOptions } from '../types';
import type { WorkspaceRole } from '@marlinjai/email-teams';
import { PERMISSIONS } from '@marlinjai/email-teams';

function hasPermission(role: WorkspaceRole, permission: string): boolean {
  const perms = PERMISSIONS[role];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  if (permission === 'contact.view' && perms.includes('contact.manage')) return true;
  return false;
}

export interface ContactListProps {
  adapter: ContactStorageAdapter;
  userRole?: WorkspaceRole;
  onSelectContact?: (contact: Contact) => void;
  onDeleteContacts?: (ids: string[]) => void;
  onTagContacts?: (ids: string[], tags: string[]) => void;
  pageSize?: number;
}

export function ContactList({
  adapter,
  userRole,
  onSelectContact,
  onDeleteContacts,
  onTagContacts,
  pageSize = 25,
}: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | ''>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const canManage = !userRole || hasPermission(userRole, 'contact.manage');

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const options: ContactListOptions = {
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      };
      const result = await adapter.listContacts(options);
      setContacts(result.data);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [adapter, page, pageSize, search, statusFilter]);

  React.useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const totalPages = Math.ceil(total / pageSize);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    onDeleteContacts?.(ids);
    setSelectedIds(new Set());
    await loadContacts();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="ec-contact-list">
      {/* Filters */}
      <div className="ec-contact-list__filters">
        <form onSubmit={handleSearch} className="ec-contact-list__search">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ec-contact-list__search-input"
          />
          <button type="submit" className="ec-contact-list__search-btn">
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ContactStatus | '');
            setPage(1);
          }}
          className="ec-contact-list__status-filter"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
          <option value="complained">Complained</option>
        </select>
      </div>

      {/* Bulk actions — only shown for users with manage permission */}
      {canManage && selectedIds.size > 0 && (
        <div className="ec-contact-list__bulk-actions">
          <span>{selectedIds.size} selected</span>
          {onDeleteContacts && (
            <button onClick={handleDelete} className="ec-contact-list__bulk-delete">
              Delete
            </button>
          )}
          {onTagContacts && (
            <button
              onClick={() => onTagContacts(Array.from(selectedIds), [])}
              className="ec-contact-list__bulk-tag"
            >
              Tag
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <table className="ec-contact-list__table">
        <thead>
          <tr>
            {canManage && (
              <th>
                <input
                  type="checkbox"
                  checked={contacts.length > 0 && selectedIds.size === contacts.length}
                  onChange={toggleSelectAll}
                />
              </th>
            )}
            <th>Email</th>
            <th>Name</th>
            <th>Status</th>
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={canManage ? 5 : 4} className="ec-contact-list__loading">
                Loading...
              </td>
            </tr>
          ) : contacts.length === 0 ? (
            <tr>
              <td colSpan={canManage ? 5 : 4} className="ec-contact-list__empty">
                No contacts found
              </td>
            </tr>
          ) : (
            contacts.map((contact) => (
              <tr
                key={contact.id}
                className="ec-contact-list__row"
                onClick={() => onSelectContact?.(contact)}
              >
                {canManage && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                    />
                  </td>
                )}
                <td>{contact.email}</td>
                <td>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}
                </td>
                <td>
                  <span className={`ec-contact-status ec-contact-status--${contact.status}`}>
                    {contact.status}
                  </span>
                </td>
                <td>
                  {contact.tags.map((tag) => (
                    <span key={tag} className="ec-contact-tag">
                      {tag}
                    </span>
                  ))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ec-contact-list__pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
