import { useState, useCallback } from 'react';
import { Ticket, Message } from '../components/Profile/types';
import { useToastContext } from '@librechat/client';

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://nadyaputriast-n8n.hf.space';

export const useTickets = (userId: string, role: string, username?: string) => {
  const { showToast } = useToastContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. FETCH (Ambil Data)
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${N8N_URL}/webhook/librechat/support-ticket-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      const list = data.data || (Array.isArray(data) ? data : []);
      setTickets(list);
    } catch (e) {
      console.error('Fetch tickets error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, role]);

  // 2. CREATE (Buat Tiket Baru)
  const createTicket = async (payload: Partial<Ticket>) => {
    setIsSubmitting(true);
    try {
      await fetch(`${N8N_URL}/webhook/librechat/support-ticket-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId }),
      });
      showToast({ message: 'Ticket created', status: 'success' });
      fetchTickets(); // Refresh list
      return true;
    } catch (e) {
      showToast({ message: 'Failed to create ticket', status: 'error' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. REPLY (Kirim Pesan - OPTIMISTIC UPDATE TETAP ADA)
  // Ini logika yang bikin chat "responsive" tanpa perlu tutup modal
  const replyTicket = async (ticketId: string, message: string) => {
    // A. Update UI DULUAN (Supaya chat langsung muncul)
    const tempMessage: Message = {
      senderId: userId,
      senderName: username || 'Me',
      role: role as 'customer' | 'employee',
      message: message,
      createdAt: new Date().toISOString(),
    };

    setTickets((prevTickets) =>
      prevTickets.map((t) => {
        if (t.ticketId === ticketId) {
          return {
            ...t,
            messages: [...(t.messages || []), tempMessage],
          };
        }
        return t;
      }),
    );

    // B. Kirim ke Server
    setIsSubmitting(true);
    try {
      await fetch(`${N8N_URL}/webhook/librechat/support-ticket-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          userId,
          message,
          senderName: username || role,
          senderType: role,
        }),
      });
      // Sukses, tidak perlu fetchTickets() agar scroll tidak loncat (opsional)
      // fetchTickets();
      return true;
    } catch (e) {
      showToast({ message: 'Failed to send message', status: 'error' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. UPDATE (Edit Judul/Deskripsi/Status) - PENTING UNTUK FITUR EDIT
  const updateTicket = async (ticketId: string, updates: Partial<Ticket>) => {
    setIsSubmitting(true);
    try {
      // A. Optimistic Update di List (Biar langsung berubah di tabel)
      setTickets(prev => prev.map(t => t.ticketId === ticketId ? { ...t, ...updates } : t));

      // B. Kirim Request
      await fetch(`${N8N_URL}/webhook/librechat/support-ticket-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, userId, ...updates }),
      });

      showToast({ message: 'Ticket updated', status: 'success' });
      return true;
    } catch (e) {
      showToast({ message: 'Update failed', status: 'error' });
      fetchTickets(); // Revert/Refresh data asli kalau error
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. DELETE (Hapus Tiket) - PENTING UNTUK MODAL DELETE
  const deleteTicket = async (ticketId: string) => {
    setIsSubmitting(true);
    // A. Simpan backup data kalau-kalau gagal
    const previousTickets = [...tickets];

    // B. Optimistic Delete (Langsung hilang dari layar)
    setTickets(prev => prev.filter(t => t.ticketId !== ticketId));

    try {
      await fetch(`${N8N_URL}/webhook/librechat/support-ticket-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, userId }),
      });
      showToast({ message: 'Ticket deleted', status: 'success' });
      return true;
    } catch (e) {
      // C. Kalau gagal, kembalikan data lama (Rollback)
      setTickets(previousTickets);
      showToast({ message: 'Delete failed', status: 'error' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    tickets,
    loading,
    isSubmitting,
    fetchTickets,
    createTicket,
    replyTicket,
    updateTicket, // Gunakan ini untuk Edit & Update Status
    deleteTicket,
  };
};
