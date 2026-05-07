/* eslint-disable i18next/no-literal-string */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Search,
  ShieldAlert,
  User,
} from 'lucide-react';
import type t from 'librechat-data-provider';
import {
  useAdminConversation,
  useAdminConversations,
  useAdminMessages,
  useAdminUser,
  useAdminUsers,
} from '~/data-provider/Admin';

const DEFAULT_LIMIT = 20;
const DEFAULT_MESSAGES_LIMIT = 50;

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  } catch {
    return '—';
  }
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat().format(n);
}

function isLikelyEmail(value: string): boolean {
  return /.+@.+\..+/.test(value);
}

/* ---------- Shared UI ---------- */

function ErrorBanner({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          {message ? <div className="mt-1 text-xs">{message}</div> : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </td>
      ))}
    </tr>
  );
}

function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-800">
      <div className="text-gray-500 dark:text-gray-400">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            Showing <span className="tabular-nums">{start}</span>–
            <span className="tabular-nums">{end}</span> of{' '}
            <span className="tabular-nums">{total}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Prev
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Page <span className="tabular-nums">{page}</span> of{' '}
          <span className="tabular-nums">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Empty state (user lookup) ---------- */

function UserLookup() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const trimmed = submitted?.trim() ?? '';
  const looksLikeEmail = trimmed.length > 0 && isLikelyEmail(trimmed);
  const looksLikeId = trimmed.length > 0 && !looksLikeEmail;

  const usersQuery = useAdminUsers({ q: trimmed, limit: 1 }, { enabled: looksLikeEmail });

  // If they typed an id-like string, try fetching that user directly.
  const userByIdQuery = useAdminUser(looksLikeId ? trimmed : '', {
    enabled: looksLikeId,
  });

  useEffect(() => {
    if (looksLikeEmail && usersQuery.data?.items?.length) {
      const found = usersQuery.data.items[0];
      if (found && found._id) {
        navigate(`/admin/messages/users/${found._id}/conversations`);
      }
    }
  }, [looksLikeEmail, usersQuery.data, navigate]);

  useEffect(() => {
    if (looksLikeId && userByIdQuery.data?.user?._id) {
      navigate(`/admin/messages/users/${userByIdQuery.data.user._id}/conversations`);
    }
  }, [looksLikeId, userByIdQuery.data, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;
    setSubmitted(value);
  };

  const isLoading =
    (looksLikeEmail && usersQuery.isFetching) || (looksLikeId && userByIdQuery.isFetching);

  const notFound =
    submitted &&
    !isLoading &&
    ((looksLikeEmail && usersQuery.isSuccess && usersQuery.data?.items?.length === 0) ||
      (looksLikeId && userByIdQuery.isError));

  const errorMessage =
    (looksLikeEmail && usersQuery.isError
      ? (usersQuery.error as Error | undefined)?.message
      : null) ??
    (looksLikeId && userByIdQuery.isError
      ? (userByIdQuery.error as Error | undefined)?.message
      : null);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Messages</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Look up a user to browse their conversations and messages.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <label
          htmlFor="messages-user-lookup"
          className="block text-sm font-medium text-gray-900 dark:text-gray-100"
        >
          Look up user by ID or email
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Enter a user&apos;s email address or their user ID.
        </p>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="messages-user-lookup"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="email@example.com or user id"
              className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Look up
          </button>
        </div>

        {notFound ? (
          <div className="mt-4 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
            No user found for &ldquo;{trimmed}&rdquo;.
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {errorMessage}
          </div>
        ) : null}
      </form>
    </div>
  );
}

/* ---------- Conversations list ---------- */

function ConversationsList({ userId }: { userId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const limit = DEFAULT_LIMIT;

  const userQuery = useAdminUser(userId);
  const convosQuery = useAdminConversations(userId, { page, limit });

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(next));
    }
    setSearchParams(params, { replace: false });
  };

  const items = convosQuery.data?.items ?? [];
  const total = convosQuery.data?.total ?? 0;

  const userLabel = useMemo(() => {
    const u = userQuery.data?.user;
    if (!u) return userId;
    return u.email ?? u.name ?? u.username ?? userId;
  }, [userQuery.data, userId]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Link
          to="/admin/messages"
          className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Look up another user
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Conversations</h1>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
            User:{' '}
            <Link
              to={`/admin/users/${userId}`}
              className="inline-flex items-center gap-1 text-gray-700 underline-offset-2 hover:underline dark:text-gray-300"
            >
              <User className="h-3 w-3" aria-hidden="true" />
              {userLabel}
            </Link>
          </p>
        </div>
      </div>

      {convosQuery.isError ? (
        <ErrorBanner
          title="Failed to load conversations"
          message={(convosQuery.error as Error | undefined)?.message}
          onRetry={() => void convosQuery.refetch()}
        />
      ) : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table" aria-label="Conversations">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Messages</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Last message</th>
              </tr>
            </thead>
            <tbody>
              {convosQuery.isLoading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden="true" />
                    This user has no conversations.
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <ConversationRow key={c.conversationId} userId={userId} convo={c} />
                ))
              )}
            </tbody>
          </table>
        </div>
        {!convosQuery.isLoading && items.length > 0 ? (
          <Pagination page={page} limit={limit} total={total} onPageChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}

function ConversationRow({
  userId,
  convo,
}: {
  userId: string;
  convo: t.AdminConversationListItem;
}) {
  const navigate = useNavigate();
  const target = `/admin/messages/users/${userId}/conversations/${encodeURIComponent(
    convo.conversationId,
  )}`;
  return (
    <tr
      role="row"
      tabIndex={0}
      onClick={() => navigate(target)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(target);
        }
      }}
      className="cursor-pointer border-t border-gray-100 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:border-gray-800 dark:hover:bg-gray-800/50 dark:focus:bg-gray-800/50"
    >
      <td className="max-w-md truncate px-4 py-3 text-gray-900 dark:text-gray-100">
        <Link to={target} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          {convo.title || '(untitled)'}
        </Link>
      </td>
      <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-300">
        {formatNumber(convo.messageCount)}
      </td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
        {formatDateTime(convo.createdAt)}
      </td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
        {formatDateTime(convo.updatedAt)}
      </td>
      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
        {formatDateTime(convo.lastMessageAt)}
      </td>
    </tr>
  );
}

/* ---------- Conversation view ---------- */

function ConversationView({ userId, conversationId }: { userId: string; conversationId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const showContent = searchParams.get('content') === '1';
  const limit = DEFAULT_MESSAGES_LIMIT;

  const convoQuery = useAdminConversation(userId, conversationId);
  const messagesQuery = useAdminMessages(userId, conversationId, {
    page,
    limit,
    includeContent: showContent,
  });

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(next));
    }
    setSearchParams(params, { replace: false });
  };

  const toggleContent = () => {
    const params = new URLSearchParams(searchParams);
    if (showContent) {
      params.delete('content');
    } else {
      params.set('content', '1');
    }
    // Reset to first page when toggling content
    params.delete('page');
    setSearchParams(params, { replace: false });
  };

  const items = messagesQuery.data?.items ?? [];
  const total = messagesQuery.data?.total ?? 0;
  const conversationsLink = `/admin/messages/users/${userId}/conversations`;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <Link
          to={conversationsLink}
          className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Back to conversations
        </Link>
      </div>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {convoQuery.data?.title || '(untitled)'}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <Link
              to={`/admin/users/${userId}`}
              className="inline-flex items-center gap-1 hover:text-gray-900 hover:underline dark:hover:text-gray-100"
            >
              <User className="h-3 w-3" aria-hidden="true" />
              View user
            </Link>
            <span aria-hidden="true">·</span>
            <span>Created {formatDateTime(convoQuery.data?.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatNumber(convoQuery.data?.messageCount)} messages</span>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleContent}
          className="inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          aria-pressed={showContent}
        >
          {showContent ? (
            <>
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              Hide content
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" aria-hidden="true" />
              Show message content
            </>
          )}
        </button>
      </div>

      {showContent ? (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          role="status"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>Viewing message content is logged in the audit trail.</span>
        </div>
      ) : null}

      {convoQuery.isError ? (
        <ErrorBanner
          title="Failed to load conversation"
          message={(convoQuery.error as Error | undefined)?.message}
          onRetry={() => void convoQuery.refetch()}
        />
      ) : null}

      {messagesQuery.isError ? (
        <ErrorBanner
          title="Failed to load messages"
          message={(messagesQuery.error as Error | undefined)?.message}
          onRetry={() => void messagesQuery.refetch()}
        />
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {messagesQuery.isLoading ? (
          <div className="flex items-center justify-center px-4 py-12 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Loading messages…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden="true" />
            This conversation has no messages.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800" aria-label="Messages">
            {items.map((m, i) => (
              <MessageBubble
                key={m.messageId ?? m._id ?? `${i}`}
                message={m}
                showContent={showContent}
              />
            ))}
          </ul>
        )}
        {!messagesQuery.isLoading && items.length > 0 ? (
          <Pagination page={page} limit={limit} total={total} onPageChange={setPage} />
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  showContent,
}: {
  message: t.AdminMessageItem;
  showContent: boolean;
}) {
  const isUser = !!message.isCreatedByUser;
  const role = isUser ? 'User' : 'Assistant';
  const senderLabel = message.sender || (isUser ? 'User' : 'Assistant');

  const text = showContent
    ? typeof message.text === 'string' && message.text.length > 0
      ? message.text
      : '(empty)'
    : '[content hidden — toggle on to view]';

  return (
    <li className="px-4 py-4" aria-label={`${role} message`}>
      <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isUser
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
            }`}
          >
            {senderLabel}
          </span>
          {message.model ? (
            <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
              {message.model}
            </span>
          ) : null}
          {typeof message.tokenCount === 'number' ? (
            <span className="tabular-nums">{formatNumber(message.tokenCount)} tokens</span>
          ) : null}
          <span>·</span>
          <span>{formatDateTime(message.createdAt)}</span>
        </div>
        <div
          className={`max-w-full rounded-lg border px-3 py-2 text-sm ${
            isUser
              ? 'border-blue-200 bg-blue-50 text-gray-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-gray-100'
              : 'border-gray-200 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-100'
          } ${!showContent ? 'italic text-gray-500 dark:text-gray-400' : ''}`}
        >
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {text}
          </pre>
        </div>
      </div>
    </li>
  );
}

/* ---------- Page entry ---------- */

export default function MessagesPage() {
  const { userId, conversationId } = useParams<{
    userId?: string;
    conversationId?: string;
  }>();

  if (!userId) {
    return <UserLookup />;
  }

  if (!conversationId) {
    return <ConversationsList userId={userId} />;
  }

  return <ConversationView userId={userId} conversationId={conversationId} />;
}
