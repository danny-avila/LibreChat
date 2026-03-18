// client/src/components/SidePanel/Contacts/ContactForm.tsx
import { useState } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { useCreateContactMutation, useUpdateContactMutation } from '~/data-provider/Contacts/queries';
import type { Contact } from '~/data-provider/Contacts/queries';

interface Props {
  contact?: Contact;
  onBack: () => void;
  onSuccess: (contact: Contact) => void;
}

export default function ContactForm({ contact, onBack, onSuccess }: Props) {
  const isEdit = !!contact;
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    company: contact?.company ?? '',
    role: contact?.role ?? '',
    email: contact?.email ?? '',
    notes: contact?.notes ?? '',
  });
  const [attrs, setAttrs] = useState<{ key: string; value: string }[]>(
    contact?.attributes ? Object.entries(contact.attributes).map(([key, value]) => ({ key, value })) : [],
  );
  const [newAttrKey, setNewAttrKey] = useState('');
  const [newAttrVal, setNewAttrVal] = useState('');
  const [error, setError] = useState('');

  const createMutation = useCreateContactMutation();
  const updateMutation = useUpdateContactMutation();
  const isLoading = createMutation.isLoading || updateMutation.isLoading;

  const addAttr = () => {
    if (!newAttrKey.trim()) return;
    setAttrs((prev) => [...prev, { key: newAttrKey.trim(), value: newAttrVal.trim() }]);
    setNewAttrKey('');
    setNewAttrVal('');
  };

  const removeAttr = (i: number) => setAttrs((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setError('');

    const attributes = Object.fromEntries(attrs.filter((a) => a.key).map((a) => [a.key, a.value]));
    const payload = { ...form, attributes };

    try {
      let result: Contact;
      if (isEdit && contact) {
        result = await updateMutation.mutateAsync({ id: contact._id, data: payload });
      } else {
        result = await createMutation.mutateAsync(payload);
      }
      onSuccess(result);
    } catch {
      setError('Failed to save contact. Please try again.');
    }
  };

  const inputClass = "w-full rounded-md border border-border-medium bg-surface-primary px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="flex h-full w-full flex-col gap-2 p-1 overflow-y-auto">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
          <ChevronLeft className="size-4" /> Back
        </button>
        <span className="text-sm font-medium text-text-primary">{isEdit ? 'Edit Contact' : 'New Contact'}</span>
      </div>

      {error && <div className="rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-500">{error}</div>}

      {(['name', 'company', 'role', 'email'] as const).map((field) => (
        <input
          key={field}
          type={field === 'email' ? 'email' : 'text'}
          placeholder={field.charAt(0).toUpperCase() + field.slice(1) + (field === 'name' ? ' *' : '')}
          value={form[field]}
          onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
          className={inputClass}
        />
      ))}

      <textarea
        placeholder="Notes"
        value={form.notes}
        onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        rows={2}
        className={inputClass + ' resize-none'}
      />

      {/* Arbitrary attributes */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Custom Attributes</div>
        {attrs.map((attr, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="flex-1 truncate rounded bg-surface-secondary px-2 py-1 text-xs">{attr.key}: {attr.value}</span>
            <button type="button" onClick={() => removeAttr(i)} className="rounded p-1 hover:bg-surface-hover">
              <X className="size-3 text-text-secondary" />
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="Key"
            value={newAttrKey}
            onChange={(e) => setNewAttrKey(e.target.value)}
            className="w-2/5 rounded-md border border-border-medium bg-surface-primary px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="text"
            placeholder="Value"
            value={newAttrVal}
            onChange={(e) => setNewAttrVal(e.target.value)}
            className="flex-1 rounded-md border border-border-medium bg-surface-primary px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button type="button" onClick={addAttr} className="rounded-md border border-border-medium p-1 hover:bg-surface-hover">
            <Plus className="size-3" />
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-auto rounded-md bg-surface-submit py-2 text-sm font-medium text-white hover:bg-surface-submit-hover disabled:opacity-50"
      >
        {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Contact'}
      </button>
    </form>
  );
}