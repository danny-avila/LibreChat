import React, { useState, useEffect, useRef } from 'react';
import { Ticket } from '../types';

interface Props {
  ticket: Ticket;
  currentUserRole: string; // 'customer' | 'employee'
  onReply: (ticketId: string, msg: string) => void;
  onResolve?: (ticketId: string) => void; // Tambahan untuk Employee
  onClose: () => void;
}

export default function TicketChatModal({
  ticket,
  currentUserRole,
  onReply,
  onResolve,
  onClose,
}: Props) {
  const [msg, setMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isClosed = ticket.status === 'closed';
  const isEmployee = currentUserRole === 'employee';

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto scroll setiap kali pesan bertambah
  useEffect(() => {
    scrollToBottom();
  }, [ticket.messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (msg.trim() && !isClosed) {
      onReply(ticket.ticketId, msg);
      setMsg('');
      // Force scroll sedikit delay biar render selesai dulu
      setTimeout(scrollToBottom, 100);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 duration-200 animate-in fade-in">
      <div className="flex h-[600px] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* HEADER */}
        <div className="z-10 flex items-center justify-between border-b bg-white p-4 shadow-sm">
          <div className="mr-2 min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-gray-800">{ticket.subject}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  ticket.status === 'open'
                    ? 'bg-green-100 text-green-700'
                    : ticket.status === 'closed'
                      ? 'bg-gray-200 text-gray-700'
                      : 'bg-blue-100 text-blue-700'
                }`}
              >
                {ticket.status}
              </span>
              <span className="text-xs text-gray-500">#{ticket.ticketId}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* TOMBOL RESOLVE (KHUSUS EMPLOYEE & TIKET BELUM CLOSED) */}
            {isEmployee && !isClosed && onResolve && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to mark this ticket as Closed?')) {
                    onResolve(ticket.ticketId);
                  }
                }}
                className="whitespace-nowrap rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
              >
                ✅ Resolve
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
        </div>

        {/* CHAT AREA */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50/50 p-4">
          {(!ticket.messages || ticket.messages.length === 0) && (
            <div className="flex h-full flex-col items-center justify-center text-sm text-gray-400">
              <p>No messages yet.</p>
              <p>Start the conversation below.</p>
            </div>
          )}

          {ticket.messages?.map((m, i) => {
            const isMe = m.role === currentUserRole;
            return (
              <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                    isMe
                      ? 'rounded-2xl rounded-tr-sm bg-blue-600 text-white'
                      : 'rounded-2xl rounded-tl-sm border border-gray-200 bg-white text-gray-800'
                  }`}
                >
                  {m.message}
                </div>
                <span className="mt-1 px-1 text-[10px] text-gray-400">
                  {isMe ? 'Me' : m.senderName} •{' '}
                  {m.createdAt
                    ? new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            );
          })}

          {isClosed && (
            <div className="my-4 flex justify-center">
              <div className="flex items-center gap-1 rounded-full bg-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600">
                🔒 Ticket Closed
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="border-t bg-white p-4">
          {isClosed ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center text-sm italic text-gray-500">
              This ticket is closed. You cannot send new messages.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-gray-300 p-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Type your message..."
                autoFocus
              />
              <button
                type="submit"
                disabled={!msg.trim()}
                className="rounded-xl bg-blue-600 p-3 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
