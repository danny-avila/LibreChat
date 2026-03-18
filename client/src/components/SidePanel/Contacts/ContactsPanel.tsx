// client/src/components/SidePanel/Contacts/ContactsPanel.tsx
import { useState } from 'react';
import { Plus, Upload, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useContactsQuery, useDeleteContactMutation, useImportContactsMutation } from '~/data-provider/Contacts/queries';
import ContactDetail from './ContactDetail';
import ContactForm from './ContactForm';
import type { Contact } from '~/data-provider/Contacts/queries';

type View = 'list' | 'detail' | 'create' | 'edit';

export default function ContactsPanel() {
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const { data, isLoading, refetch } = useContactsQuery({ page, limit: 20, search });
  const deleteMutation = useDeleteContactMutation();
  const importMutation = useImportContactsMutation();

  const contacts = data?.contacts ?? [];
  const totalPages = data?.pages ?? 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing...');
    try {
      const result = await importMutation.mutateAsync(file);
      setImportStatus(`✓ Imported ${result.imported} contacts${result.errors ? `, ${result.errors} skipped` : ''}`);
      setTimeout(() => setImportStatus(null), 4000);
    } catch {
      setImportStatus('✗ Import failed');
      setTimeout(() => setImportStatus(null), 3000);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    await deleteMutation.mutateAsync(id);
    setView('list');
    setSelected(null);
  };

  if (view === 'detail' && selected) {
    return (
      <ContactDetail
        contact={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onEdit={() => setView('edit')}
        onDelete={() => handleDelete(selected._id)}
      />
    );
  }

  if (view === 'create') {
    return (
      <ContactForm
        onBack={() => setView('list')}
        onSuccess={() => { setView('list'); refetch(); }}
      />
    );
  }

  if (view === 'edit' && selected) {
    return (
      <ContactForm
        contact={selected}
        onBack={() => setView('detail')}
        onSuccess={(updated) => { setSelected(updated); setView('detail'); }}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-2 p-1">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-1">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search contacts..."
          className="flex-1 rounded-md border border-border-medium bg-surface-primary px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button type="submit" className="rounded-md border border-border-medium p-1.5 hover:bg-surface-hover">
          <Search className="size-4 text-text-secondary" />
        </button>
      </form>

      {/* Action buttons */}
      <div className="flex gap-1">
        <button
          onClick={() => setView('create')}
          className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border-medium py-1.5 text-xs hover:bg-surface-hover"
        >
          <Plus className="size-3" /> New Contact
        </button>
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-border-medium py-1.5 text-xs hover:bg-surface-hover">
          <Upload className="size-3" /> Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {/* Import status */}
      {importStatus && (
        <div className="rounded-md bg-surface-secondary px-2 py-1.5 text-xs text-text-secondary">
          {importStatus}
        </div>
      )}

      {/* Contact list */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">Loading...</div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
          {search ? 'No contacts found' : 'No contacts yet. Create one or import a CSV.'}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {contacts.map((contact) => (
            <button
              key={contact._id}
              onClick={() => { setSelected(contact); setView('detail'); }}
              className="w-full rounded-md border border-border-light p-2 text-left hover:bg-surface-hover transition-colors"
            >
              <div className="text-sm font-medium text-text-primary truncate">{contact.name}</div>
              {(contact.role || contact.company) && (
                <div className="text-xs text-text-secondary truncate">
                  {[contact.role, contact.company].filter(Boolean).join(' · ')}
                </div>
              )}
              {contact.email && (
                <div className="text-xs text-text-tertiary truncate">{contact.email}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border-light pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded p-1 hover:bg-surface-hover disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-text-secondary">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded p-1 hover:bg-surface-hover disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}