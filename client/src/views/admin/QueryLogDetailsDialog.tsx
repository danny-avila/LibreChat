import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { Info } from 'lucide-react';
import moment from 'moment';
import ReactMarkdown from 'react-markdown';
import { cn } from '~/utils';
import React from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';

interface MessageSegment {
  type: 'markdown' | 'code';
  content: string;
  language?: string;
}

interface MessageType {
  type: 'json' | 'mixed';
  content: any;
}

const parseMessageSegments = (text: string): MessageSegment[] => {
  const segments: MessageSegment[] = [];
  const codeRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'markdown',
        content: text.slice(lastIndex, match.index).trim(),
      });
    }
    segments.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'markdown',
      content: text.slice(lastIndex).trim(),
    });
  }

  if (segments.length === 0) {
    segments.push({
      type: 'markdown',
      content: text.trim(),
    });
  }

  return segments;
};

const detectMessageType = (text: string): MessageType => {
  try {
    const parsed = JSON.parse(text);
    return { type: 'json', content: parsed };
  } catch {
    return { type: 'mixed', content: parseMessageSegments(text) };
  }
};

interface QueryLog {
  _id: string;
  conversationId: string;
  user: { name?: string; email?: string; id?: string };
  title?: string;
  totalTokens?: number;
  messageCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface QueryLogDetailsDialogProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  selectedLog: QueryLog | null;
}

const QueryLogDetailsDialog: React.FC<QueryLogDetailsDialogProps> = ({
  dialogOpen,
  setDialogOpen,
  selectedLog,
}) => {
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<
    { id?: string; role: 'ai' | 'user'; text: string; createdAt: string; model?: string | null; tokenCount?: number; conversationId?: string }[]
  >([]);

  const sseRef = React.useRef<EventSourcePolyfill | null>(null);
  const messageIdsRef = React.useRef<Set<string>>(new Set());

  // SSE subscription
  React.useEffect(() => {
    if (!dialogOpen || !selectedLog?.conversationId) {
      setHistory([]);
      setHistoryError(null);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setHistoryError('No authentication token found');
      return;
    }

    const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
    setLoadingHistory(true);
    setHistory([]);
    messageIdsRef.current = new Set();

    const es = new EventSourcePolyfill(
      `${API_BASE}/api/logs/conversations/${selectedLog.conversationId}/messages`,
      {
        headers: { Authorization: `Bearer ${token}` },
        heartbeatTimeout: 60000,
      }
    );
    sseRef.current = es;

    es.onmessage = (event) => {
      if (!event.data) return;
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'heartbeat' || data.type === 'init' || data.type === 'historical_complete') {
          setLoadingHistory(false);
          return;
        }

        if (data.event === 'historical_message' || data.event === 'realtime_message') {
          const id = String(data.messageId || '');
          if (id && messageIdsRef.current.has(id)) return;
          if (id) messageIdsRef.current.add(id);

          const entry = {
            id,
            role: (data.model ? 'ai' : 'user') as 'ai' | 'user',
            text: String(data.text || ''),
            createdAt: String(data.createdAt || ''),
            model: data.model ?? null,
            tokenCount: data.tokenCount ?? 0,
            conversationId: data.conversationId,
          };

          setHistory((prev) => [entry, ...prev]);
        }
      } catch (err) {
        console.error('[QueryLogDetailsDialog] SSE parse error', err, event.data);
      }
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      setHistoryError('Failed to stream conversation messages');
      setLoadingHistory(false);
    };

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [dialogOpen, selectedLog?.conversationId]);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent
        className={cn(
          'max-h-[90vh] max-w-4xl w-full overflow-hidden border border-border-light shadow-xl p-6',
          'dark:border-gray-700 dark:bg-gray-800',
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'grid gap-4 rounded-lg bg-white animate-in data-[state=open]:fade-in-90 data-[state=open]:slide-in-from-bottom-10',
        )}
      >
        <DialogHeader className="border-b border-border-light pb-3 pt-2 flex-shrink-0">
          <DialogTitle className="flex items-start justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <span className="rounded-full p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                <Info className="h-4 w-4" />
              </span>
              <span className="text-foreground">Query Log Details</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {selectedLog && (
          <div
            className="space-y-6 p-4 pb-8 text-sm text-foreground overflow-y-auto min-w-0"
            style={{ maxHeight: 'calc(90vh - 200px)' }}
          >
            {/* User Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  User
                </label>
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 min-w-0">
                  <div className="truncate">{selectedLog.user?.name ?? 'Unknown'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedLog.user?.email ?? 'N/A'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Tokens
                </label>
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {history.reduce((acc, m) => acc + (m.tokenCount || 0), 0)}
                </div>
              </div>

              <div className="flex flex-col gap-1 col-span-2 min-w-0">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Timestamp
                </label>
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {moment(selectedLog.createdAt).format('Do MMMM YYYY, h:mm:ss a')}
                </div>
              </div>
            </div>

            {/* Conversation History */}
            <div className="min-w-0">
              <p className="text-muted-foreground font-medium mb-2">Conversation History</p>
              <div className="max-h-[calc(90vh - 260px)] overflow-y-auto rounded-md border bg-muted p-3 pb-6 text-sm text-muted-foreground dark:bg-muted/50 min-w-0">
                {loadingHistory && <div className="text-xs">Loading history…</div>}
                {historyError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{historyError}</div>
                )}
                {!loadingHistory && !historyError && history.length === 0 && (
                  <div className="text-xs">No history available.</div>
                )}
                {!loadingHistory && history.length > 0 && (
                  <ul className="space-y-3">
                    {history.map((h, idx) => (
                      <li key={idx} className="min-w-0">
                        <div className="flex items-start gap-2">
                          <span
                            className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                              h.role === 'ai'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            }`}
                          >
                            {h.role === 'ai'
                              ? `AI${h.model ? ` · ${h.model}` : ''}`
                              : 'User'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <div className="text-[10px] text-muted-foreground">
                                {moment(h.createdAt).format('Do MMM YYYY, h:mm:ss a')}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {typeof h.tokenCount === 'number'
                                  ? `${h.tokenCount} tokens`
                                  : ''}
                              </div>
                            </div>
                            <div className="prose prose-sm max-w-none break-words">
                              <ReactMarkdown>{h.text || ''}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QueryLogDetailsDialog;
