import React from 'react';
import TicketList from '../TicketList';

export default function EmployeeSupportTab({
  teamInbox,
  myWorkspace,
  ticketSearch,
  setTicketSearch,
  onClaimTicket,
  onChat,
  onResolve,
  onRefresh,
}) {
  // Filter and sort tickets by subject (or createdAt if available)
  const filteredTeamInbox = teamInbox
    .filter((t) =>
      t.subject?.toLowerCase().includes(ticketSearch.toLowerCase())
    )
    .sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return a.subject.localeCompare(b.subject);
    });
  const filteredMyWorkspace = myWorkspace
    .filter((t) =>
      t.subject?.toLowerCase().includes(ticketSearch.toLowerCase())
    )
    .sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return a.subject.localeCompare(b.subject);
    });

  return (
    <div className="space-y-6 duration-500 animate-in fade-in">
      <div className="flex justify-end">
        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Search tickets..."
            className="w-full rounded-lg border py-2 pl-9 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {/* INBOX */}
        <div className="flex h-[600px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-gray-50 p-4">
            <h3 className="font-bold text-gray-700">Team Inbox</h3>
            <button onClick={onRefresh} className="text-xs text-blue-600 hover:underline">
              Refresh
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <TicketList
              tickets={filteredTeamInbox}
              searchTerm={ticketSearch}
              showClaim={true}
              onClaim={onClaimTicket}
            />
          </div>
        </div>
        {/* WORKSPACE */}
        <div className="flex h-[600px] flex-col overflow-hidden rounded-xl border border-blue-200 bg-blue-50/30 shadow-sm">
          <div className="flex items-center justify-between border-b border-blue-200 bg-blue-100/50 p-4">
            <h3 className="font-bold text-blue-900">My Workspace</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <TicketList
              tickets={filteredMyWorkspace}
              searchTerm={ticketSearch}
              onChat={onChat}
              onResolve={onResolve}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
