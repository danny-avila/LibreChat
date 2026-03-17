import React, { useState, useRef } from 'react';
import { useGetContacts, useImportContactsCSV, useDeleteContact } from '~/data-provider/contacts';
import { Upload, Trash2, Edit2, Search, UserPlus } from 'lucide-react';
import type { TContact } from '~/common/types/contacts';
import ContactForm from './ContactForm';

export default function ContactsWorkspace() {
    const { data: contacts, isLoading, error } = useGetContacts();
    const importCSV = useImportContactsCSV();
    const deleteContact = useDeleteContact();

    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<TContact | undefined>();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            await importCSV.mutateAsync(file);
            alert('Contacts imported successfully!');
        } catch (err) {
            alert('Failed to import contacts. Please try again.');
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (window.confirm(`Are you sure you want to delete ${name}?`)) {
            await deleteContact.mutateAsync(id);
        }
    };

    const handleEdit = (contact: TContact) => {
        setEditingContact(contact);
        setIsFormOpen(true);
    };

    const handleAddNew = () => {
        setEditingContact(undefined);
        setIsFormOpen(true);
    };

    const filteredContacts = contacts?.filter((c) => {
        const search = searchTerm.toLowerCase();
        return (
            c.name.toLowerCase().includes(search) ||
            (c.company || '').toLowerCase().includes(search) ||
            (c.role || '').toLowerCase().includes(search) ||
            (c.email || '').toLowerCase().includes(search)
        );
    });

    return (
        <div className="flex w-full flex-col h-[100vh]">
            {/* Header */}
            <div className="flex w-full items-center justify-between border-b border-border/10 p-6">
                <div>
                    <h1 className="text-2xl font-semibold text-text-primary">Contacts</h1>
                    <p className="text-sm text-text-secondary mt-1">Manage your professional network and connections.</p>
                </div>

                <div className="flex gap-3">
                    <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />
                    <button
                        className="flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary hover:bg-border/10 focus:outline-none"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importCSV.isLoading}
                    >
                        {importCSV.isLoading ? <span className="animate-spin">⌛</span> : <Upload size={16} />}
                        Import CSV
                    </button>

                    <button
                        className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 focus:outline-none"
                        onClick={handleAddNew}
                    >
                        <UserPlus size={16} />
                        Add Contact
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto bg-background p-6">
                <div className="mx-auto max-w-6xl space-y-6">

                    {/* Search bar */}
                    <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Search size={18} className="text-text-secondary" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search contacts by name, company, email..."
                            className="w-full lg:w-1/2 rounded-lg border border-border/20 bg-surface px-10 py-2 text-sm text-text-primary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Table */}
                    <div className="overflow-hidden rounded-lg border border-border/20 bg-surface shadow-sm">
                        {isLoading ? (
                            <div className="p-8 text-center text-text-secondary">Loading contacts...</div>
                        ) : error ? (
                            <div className="p-8 text-center text-red-500">Error loading contacts.</div>
                        ) : filteredContacts?.length === 0 ? (
                            <div className="p-16 text-center text-text-secondary">
                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-border/20 mb-4">
                                    <UserPlus size={24} className="text-text-primary" />
                                </div>
                                <h3 className="text-lg font-medium text-text-primary">No contacts found</h3>
                                <p className="mt-1">Get started by importing a CSV or adding a new contact.</p>
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-border/20">
                                <thead className="bg-background">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-text-secondary uppercase">Name</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-text-secondary uppercase">Company & Role</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold tracking-wider text-text-secondary uppercase">Email</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold tracking-wider text-text-secondary uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10 bg-surface text-sm">
                                    {filteredContacts?.map((contact) => (
                                        <tr key={contact._id} className="hover:bg-border/5 transition-colors">
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <div className="font-medium text-text-primary">{contact.name}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4">
                                                <div className="text-text-primary">{contact.company || '-'}</div>
                                                <div className="text-xs text-text-secondary mt-0.5">{contact.role}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-text-secondary">
                                                {contact.email || '-'}
                                            </td>
                                            <td className="whitespace-nowrap px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        className="rounded p-1.5 text-text-secondary hover:bg-border/20 hover:text-text-primary transition"
                                                        onClick={() => handleEdit(contact)}
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        className="rounded p-1.5 text-text-secondary hover:bg-red-500/20 hover:text-red-500 transition"
                                                        onClick={() => handleDelete(contact._id, contact.name)}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit/Create Modal */}
            {isFormOpen && (
                <ContactForm
                    contact={editingContact}
                    onClose={() => setIsFormOpen(false)}
                />
            )}
        </div>
    );
}
