import React, { useState, useMemo } from 'react';
import { Ticket } from '../types';

interface TicketListProps {
  tickets: Ticket[];
  onChat?: (ticket: Ticket) => void;
  onEdit?: (ticket: Ticket) => void;
  onDelete?: (ticket: Ticket) => void;
  onClaim?: (ticket: Ticket) => void;
  onResolve?: (ticket: Ticket) => void; // <--- PROP BARU
  showClaim?: boolean;
  searchTerm?: string;
}

type SortKey = 'createdAt' | 'priority' | 'status';

const TicketList: React.FC<TicketListProps> = ({
  tickets,
  onChat,
  onEdit,
  onDelete,
  onClaim,
  onResolve,
  showClaim,
  searchTerm = '',
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Logic Sorting & Filtering (Tetap sama seperti sebelumnya)
  const processedTickets = useMemo(() => {
    let result = [...tickets];
    if (searchTerm.trim()) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          (t.subject || '').toLowerCase().includes(lowerTerm) ||
          (t.description || '').toLowerCase().includes(lowerTerm),
      );
    }
    result.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];
      if (sortKey === 'priority') {
        const priorityWeight: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        valA = priorityWeight[valA?.toLowerCase()] || 0;
        valB = priorityWeight[valB?.toLowerCase()] || 0;
      } else if (sortKey === 'createdAt') {
        valA = new Date(a.createdAt || 0).getTime();
        valB = new Date(b.createdAt || 0).getTime();
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [tickets, searchTerm, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="ml-1 text-gray-300">↕</span>;
    return sortDir === 'asc' ? (
      <span className="ml-1 text-blue-600">↑</span>
    ) : (
      <span className="ml-1 text-blue-600">↓</span>
    );
  };

  if (!tickets.length)
    return <div className="py-8 text-center text-gray-400">No tickets found.</div>;

  return (
    <div className="space-y-4">
      {/* Header Sorting */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-2 text-xs font-semibold text-gray-500">
        <button
          onClick={() => handleSort('createdAt')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'createdAt' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Date {getSortIcon('createdAt')}
        </button>
        <button
          onClick={() => handleSort('priority')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'priority' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Priority {getSortIcon('priority')}
        </button>
        <button
          onClick={() => handleSort('status')}
          className={`flex items-center rounded border px-3 py-1.5 transition-colors ${sortKey === 'status' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
        >
          Status {getSortIcon('status')}
        </button>
      </div>

      {processedTickets.map((ticket) => {
        const isClosed = ticket.status === 'closed';
        return (
          <div
            key={ticket.ticketId || ticket._id}
            className={`flex flex-col rounded border p-4 shadow-sm transition-colors md:flex-row md:items-center md:justify-between ${isClosed ? 'border-gray-200 bg-gray-50' : 'border-border-light bg-white'}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-lg font-semibold ${isClosed ? 'text-gray-500' : 'text-gray-900'}`}
                >
                  {ticket.subject}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${ticket.status === 'open' ? 'bg-green-100 text-green-700' : isClosed ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-700'}`}
                >
                  {ticket.status}
                </span>
              </div>
              <div className="mt-1 flex gap-2 text-xs text-gray-500">
                <span
                  className={`font-medium uppercase ${ticket.priority === 'urgent' ? 'text-red-600' : ticket.priority === 'high' ? 'text-orange-600' : 'text-gray-500'}`}
                >
                  {ticket.priority} Priority
                </span>
                <span>•</span>
                <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-0.5 text-xs text-gray-400">ID: {ticket.ticketId}</div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 md:mt-0">
              {/* CLAIM BUTTON */}
              {showClaim && onClaim && !isClosed && (
                <button
                  className="rounded border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                  onClick={() => onClaim(ticket)}
                >
                  Claim
                </button>
              )}

              {/* RESOLVE BUTTON (BARU - Hijau) */}
              {onResolve && !isClosed && (
                <button
                  className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-green-700"
                  onClick={() => onResolve(ticket)}
                  title="Mark as Resolved"
                >
                  <span>✓</span> Resolve
                </button>
              )}

              {/* CHAT BUTTON */}
              {onChat && (
                <button
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                  onClick={() => onChat(ticket)}
                >
                  {isClosed ? 'View Chat' : 'Chat'}
                </button>
              )}

              {/* EDIT BUTTON */}
              {onEdit && (
                <button
                  className={`rounded border px-3 py-1 text-xs font-medium ${isClosed ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : 'border-blue-200 bg-white text-blue-600 hover:bg-blue-50'}`}
                  onClick={() => !isClosed && onEdit(ticket)}
                  disabled={isClosed}
                >
                  Edit
                </button>
              )}

              {/* DELETE BUTTON */}
              {onDelete && (
                <button
                  className={`rounded border px-3 py-1 text-xs font-medium ${!isClosed ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : 'border-red-200 bg-white text-red-600 hover:bg-red-50'}`}
                  onClick={() => isClosed && onDelete(ticket)}
                  disabled={!isClosed}
                >
                  Del
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TicketList;
