import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';
import { Info, ArrowLeft } from 'lucide-react';
import moment from 'moment';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
  const codeRegex = /(\w+)?\n([\s\S]*?)\n/g;
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
  } catch (e) {
    return { type: 'mixed', content: parseMessageSegments(text) };
  }
};

const renderJsonContent = (json: any) => {
  if (json.clarification_question) {
    return (
      <>
        <p>{json.clarification_question.text}</p>
        {json.clarification_question.options && (
          <div>
            <p className="font-semibold mt-2">Options:</p>
            <ul className="list-disc pl-5">
              {json.clarification_question.options.map(
                (option: { title: string; description: string }, index: number) => (
                  <li key={index}>
                    <strong>{option.title}</strong>: {option.description}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </>
    );
  }
  return (
    <pre className="text-sm whitespace-pre-wrap break-all overflow-x-auto">
      {JSON.stringify(json, null, 2)}
    </pre>
  );
};

interface QueryLog {
  _id: string;
  user: { name?: string; email?: string; id?: string };
  role: 'user' | 'ai';
  model: string | null;
  text: string;
  tokenCount: number;
  createdAt: string;
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
  const message = selectedLog?.text || 'No message available';
  const messageType = detectMessageType(message);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {/* Fixed width constraints and overflow handling */}
      <DialogContent className="max-h-[85vh] max-w-5xl w-full overflow-hidden border border-border-light shadow-xl">
        <DialogHeader className="border-b border-border-light pb-3 pt-2 flex-shrink-0">
          <DialogTitle className="flex items-start justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full p-1.5 ${
                  selectedLog?.role === 'ai'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                }`}
              >
                {selectedLog?.role === 'ai' ? (
                  <Info className="h-4 w-4" />
                ) : (
                  <ArrowLeft className="h-4 w-4" />
                )}
              </span>
              <span className="text-foreground">Query Log Details</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {selectedLog && (
          <div className="space-y-6 p-4 pb-8 text-sm text-foreground overflow-y-auto min-w-0" style={{ maxHeight: 'calc(85vh - 200px)' }}>
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

              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Role
                </label>
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      selectedLog.role === 'ai'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    }`}
                  >
                    {selectedLog.role === 'ai' ? 'AI' : 'User'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Model
                </label>
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 truncate">
                  {selectedLog.model ?? '—'}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Tokens
                </label>
                <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {selectedLog.tokenCount ?? 0}
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

            {/* Message Content - Fixed overflow handling */}
            <div className="min-w-0">
              <p className="text-muted-foreground font-medium mb-2">Message</p>
              <div className="max-h-[calc(100% - 100px)] overflow-y-auto rounded-md border bg-muted p-3 pb-6 text-sm text-muted-foreground dark:bg-muted/50 min-w-0">
                {messageType.type === 'json' && renderJsonContent(messageType.content)}
                {messageType.type === 'mixed' && (
                  <>
                    {messageType.content.map((segment: MessageSegment, index: number) => (
                      <div key={index} className="mb-3 min-w-0">
                        {segment.type === 'markdown' && (
                          <div className="prose prose-sm max-w-none break-words">
                            <ReactMarkdown>{segment.content}</ReactMarkdown>
                          </div>
                        )}
                        {segment.type === 'code' && (
                          <div className="mb-3 min-w-0 overflow-hidden">
                            <div className="overflow-x-auto">
                              <SyntaxHighlighter
                                language={segment.language}
                                style={vscDarkPlus}
                                customStyle={{
                                  margin: 0,
                                  padding: '0.75rem',
                                  fontSize: '0.875rem',
                                  minWidth: 0,
                                  maxWidth: '100%',
                                }}
                                wrapLongLines={true}
                                showLineNumbers={false}
                              >
                                {segment.content}
                              </SyntaxHighlighter>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
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