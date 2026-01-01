import React, { useState, useEffect } from 'react';
import { Ticket } from '../types'; // Import dari types global, bukan dashboard

interface Props {
  ticket: Ticket;
  onUpdate: (data: Partial<Ticket>) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

export default function TicketEditModal({ ticket, onUpdate, onClose, isSubmitting }: Props) {
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });

  // Isi form saat modal dibuka
  useEffect(() => {
    if (ticket) {
      setForm({
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority,
      });
    }
  }, [ticket]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Gabungkan data lama ticket dengan perubahan form
    onUpdate({ ...ticket, ...form });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 duration-200 animate-in fade-in">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold">Edit Ticket</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Subject</label>
            <input
              className="w-full rounded border p-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Description</label>
            <textarea
              className="w-full rounded border p-2 outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Priority</label>
            <select
              className="w-full rounded border bg-white p-2"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              disabled={isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-4 py-2 hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {isSubmitting ? 'Updating...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
