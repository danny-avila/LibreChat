import React, { useState, useEffect } from 'react';
import { useCreateContact, useUpdateContact } from '~/data-provider/contacts';
import { X, Plus, Trash2 } from 'lucide-react';
import type { TContact, TContactPayload } from '~/common/types/contacts';
interface ContactFormProps {
    contact?: TContact;
    onClose: () => void;
}

export default function ContactForm({ contact, onClose }: ContactFormProps) {
    const createContact = useCreateContact();
    const updateContact = useUpdateContact();

    const isEditing = !!contact;

    const [formData, setFormData] = useState<TContactPayload>({
        name: '',
        company: '',
        role: '',
        email: '',
        notes: '',
        attributes: {},
    });

    // Custom attributes management
    const [attributesList, setAttributesList] = useState<{ key: string, value: string }[]>([]);

    useEffect(() => {
        if (contact) {
            setFormData({
                name: contact.name || '',
                company: contact.company || '',
                role: contact.role || '',
                email: contact.email || '',
                notes: contact.notes || '',
                attributes: contact.attributes || {},
            });

            if (contact.attributes) {
                const attrs = Object.entries(contact.attributes).map(([k, v]) => ({ key: k, value: String(v) }));
                setAttributesList(attrs);
            }
        }
    }, [contact]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleAddAttribute = () => {
        setAttributesList([...attributesList, { key: '', value: '' }]);
    };

    const handleRemoveAttribute = (index: number) => {
        const newAttrs = [...attributesList];
        newAttrs.splice(index, 1);
        setAttributesList(newAttrs);
    };

    const handleAttributeChange = (index: number, field: 'key' | 'value', val: string) => {
        const newAttrs = [...attributesList];
        newAttrs[index][field] = val;
        setAttributesList(newAttrs);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Rebuild attributes object
        const attributes: Record<string, any> = {};
        attributesList.forEach((attr) => {
            if (attr.key.trim()) {
                attributes[attr.key.trim()] = attr.value.trim();
            }
        });

        const payload = {
            ...formData,
            attributes,
        };

        try {
            if (isEditing && contact?._id) {
                await updateContact.mutateAsync({ id: contact._id, data: payload });
            } else {
                await createContact.mutateAsync(payload);
            }
            onClose();
        } catch (error) {
            console.error('Error saving contact:', error);
            alert('Failed to save contact');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border/20 bg-surface shadow-2xl">

                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-border/10 bg-background px-6 py-4">
                    <h2 className="text-xl font-semibold text-text-primary">
                        {isEditing ? 'Edit Contact' : 'New Contact'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded p-1.5 text-text-secondary hover:bg-border/20 hover:text-text-primary"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col overflow-y-auto p-6">
                    <div className="space-y-5">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">Full Name *</label>
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full rounded-md border border-border/20 bg-background px-3 py-2 text-sm text-text-primary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                placeholder="Jane Doe"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-secondary">Company</label>
                                <input
                                    type="text"
                                    name="company"
                                    value={formData.company}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-border/20 bg-background px-3 py-2 text-sm text-text-primary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                    placeholder="Acme Corp"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-secondary">Role / Title</label>
                                <input
                                    type="text"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-border/20 bg-background px-3 py-2 text-sm text-text-primary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                    placeholder="Engineer"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">Email Address</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full rounded-md border border-border/20 bg-background px-3 py-2 text-sm text-text-primary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                placeholder="jane@example.com"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">Notes</label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                rows={3}
                                className="w-full rounded-md border border-border/20 bg-background px-3 py-2 text-sm text-text-primary focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                                placeholder="Met at the Tech Conference 2026..."
                            />
                        </div>

                        {/* Custom Attributes Section */}
                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-text-secondary">Custom Attributes</label>
                                <button
                                    type="button"
                                    onClick={handleAddAttribute}
                                    className="flex items-center gap-1 text-xs text-green-500 hover:text-green-600"
                                >
                                    <Plus size={14} /> Add Field
                                </button>
                            </div>

                            {attributesList.length === 0 ? (
                                <p className="text-xs text-text-secondary italic">No custom attributes added. Add fields like 'Phone', 'Industry', or 'Location'.</p>
                            ) : (
                                <div className="space-y-3">
                                    {attributesList.map((attr, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                placeholder="Key (e.g. Phone)"
                                                value={attr.key}
                                                onChange={(e) => handleAttributeChange(index, 'key', e.target.value)}
                                                className="w-1/3 rounded-md border border-border/20 bg-background px-3 py-2 text-xs text-text-primary focus:border-green-500 focus:outline-none"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Value"
                                                value={attr.value}
                                                onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                                                className="flex-1 rounded-md border border-border/20 bg-background px-3 py-2 text-xs text-text-primary focus:border-green-500 focus:outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAttribute(index)}
                                                className="p-1.5 text-text-secondary hover:text-red-500"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="mt-8 flex justify-end gap-3 border-t border-border/10 pt-4">
                        <button
                            type="button"
                            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary hover:bg-border/10 focus:outline-none"
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 focus:outline-none"
                            disabled={createContact.isLoading || updateContact.isLoading}
                        >
                            {createContact.isLoading || updateContact.isLoading ? 'Saving...' : 'Save Contact'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
