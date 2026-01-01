import React from 'react';
import TicketList from '../TicketList';

export default function CustomerTicketsTab({
  tickets,
  ticketSearch,
  setTicketSearch,
  onNewTicket,
  onChat,
  onEdit,
  onDelete,
  onResolve,
}) {
  return (
    <div className="duration-500 animate-in fade-in slide-in-from-bottom-4">
      <div className="mb-4 flex flex-col items-center justify-between gap-3 md:flex-row">
        <h2 className="text-xl font-semibold">Support Tickets</h2>
        <div className="flex w-full gap-2 md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder="Search tickets..."
              className="w-full rounded-lg border py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <button
            onClick={onNewTicket}
            className="btn btn-primary flex items-center gap-1 whitespace-nowrap"
          >
            <span>+</span> New Ticket
          </button>
        </div>
      </div>
      <TicketList
        tickets={tickets}
        searchTerm={ticketSearch}
        onChat={onChat}
        onEdit={onEdit}
        onDelete={onDelete}
        onResolve={onResolve}
      />
    </div>
  );
}
