import React, { useState } from 'react';
import type { Contact, ContactStorageAdapter, UpdateContactInput } from '../types';

export interface ContactDetailProps {
  contact: Contact;
  adapter: ContactStorageAdapter;
  onUpdate?: (updated: Contact) => void;
  onDelete?: () => void;
  onBack?: () => void;
}

export function ContactDetail({
  contact,
  adapter,
  onUpdate,
  onDelete,
  onBack,
}: ContactDetailProps) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(contact.email);
  const [firstName, setFirstName] = useState(contact.firstName ?? '');
  const [lastName, setLastName] = useState(contact.lastName ?? '');
  const [tagsInput, setTagsInput] = useState(contact.tags.join(', '));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const input: UpdateContactInput = {
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      const updated = await adapter.updateContact(contact.id, input);
      onUpdate?.(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await adapter.deleteContact(contact.id);
    onDelete?.();
  };

  return (
    <div className="ec-contact-detail">
      {onBack && (
        <button onClick={onBack} className="ec-contact-detail__back">
          Back to list
        </button>
      )}

      <div className="ec-contact-detail__header">
        <h2 className="ec-contact-detail__title">
          {contact.firstName ?? ''} {contact.lastName ?? contact.email}
        </h2>
        <span className={`ec-contact-status ec-contact-status--${contact.status}`}>
          {contact.status}
        </span>
      </div>

      {editing ? (
        <div className="ec-contact-detail__form">
          <label className="ec-contact-detail__field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="ec-contact-detail__field">
            <span>First name</span>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="ec-contact-detail__field">
            <span>Last name</span>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label className="ec-contact-detail__field">
            <span>Tags (comma-separated)</span>
            <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
          </label>

          <div className="ec-contact-detail__actions">
            <button onClick={handleSave} disabled={saving} className="ec-contact-detail__save">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="ec-contact-detail__cancel">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="ec-contact-detail__info">
          <dl>
            <dt>Email</dt>
            <dd>{contact.email}</dd>
            <dt>First name</dt>
            <dd>{contact.firstName ?? '-'}</dd>
            <dt>Last name</dt>
            <dd>{contact.lastName ?? '-'}</dd>
            <dt>Tags</dt>
            <dd>
              {contact.tags.length > 0
                ? contact.tags.map((tag) => (
                    <span key={tag} className="ec-contact-tag">
                      {tag}
                    </span>
                  ))
                : '-'}
            </dd>
            <dt>Custom fields</dt>
            <dd>
              {Object.entries(contact.customFields).length > 0
                ? Object.entries(contact.customFields).map(([k, v]) => (
                    <div key={k}>
                      <strong>{k}:</strong> {v}
                    </div>
                  ))
                : '-'}
            </dd>
            <dt>Created</dt>
            <dd>{contact.createdAt}</dd>
            <dt>Updated</dt>
            <dd>{contact.updatedAt}</dd>
          </dl>

          <div className="ec-contact-detail__actions">
            <button onClick={() => setEditing(true)} className="ec-contact-detail__edit">
              Edit
            </button>
            <button onClick={handleDelete} className="ec-contact-detail__delete">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
