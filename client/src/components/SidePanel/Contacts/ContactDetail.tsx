// client/src/components/SidePanel/Contacts/ContactDetail.tsx
import { ChevronLeft, Pencil, Trash2, Mail, Briefcase, Building2 } from 'lucide-react';
import type { Contact } from '~/data-provider/Contacts/queries';

interface Props {
  contact: Contact;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ContactDetail({ contact, onBack, onEdit, onDelete }: Props) {
  const attrs = contact.attributes
    ? Object.entries(contact.attributes).filter(([, v]) => v)
    : [];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
          <ChevronLeft className="size-4" /> Back
        </button>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1.5 hover:bg-surface-hover" title="Edit">
            <Pencil className="size-4 text-text-secondary" />
          </button>
          <button onClick={onDelete} className="rounded p-1.5 hover:bg-surface-hover" title="Delete">
            <Trash2 className="size-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <h2 className="text-base font-semibold text-text-primary">{contact.name}</h2>
        {contact.role && (
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <Briefcase className="size-3" /> {contact.role}
          </div>
        )}
        {contact.company && (
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <Building2 className="size-3" /> {contact.company}
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <Mail className="size-3" />
            <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
          </div>
        )}
      </div>

      {/* Notes */}
      {contact.notes && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">Notes</div>
          <p className="text-sm text-text-primary">{contact.notes}</p>
        </div>
      )}

      {/* Arbitrary attributes */}
      {attrs.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">Attributes</div>
          <div className="space-y-1">
            {attrs.map(([key, val]) => (
              <div key={key} className="flex justify-between rounded-md bg-surface-secondary px-2 py-1">
                <span className="text-xs text-text-secondary">{key}</span>
                <span className="text-xs text-text-primary">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-text-tertiary mt-auto">
        Added {new Date(contact.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}