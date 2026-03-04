// Admin Conversations Component - Updated 2026-01-29
import React, { useState, useCallback, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@librechat/client';
import {
  MessageSquare,
  Search,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Bot,
  Clock,
  Filter,
  X,
} from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

// Type definitions for admin conversations
interface AdminConversationUser {
  _id: string;
  email: string;
  name?: string;
  username?: string;
  avatar?: string;
}

interface AdminConversation {
  conversationId: string;
  title: string;
  endpoint: string;
  user: string;
  model?: string;
  agent_id?: string;
  assistant_id?: string;
  createdAt: string;
  updatedAt: string;
  userInfo: AdminConversationUser | null;
}

interface AdminConversationsResponse {
  conversations: AdminConversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Type definitions for content parts
interface TextContentPart {
  type: 'text';
  text: string | { value: string };
}

interface ThinkContentPart {
  type: 'think';
  think: string;
}

type ContentPart = TextContentPart | ThinkContentPart | { type: string; [key: string]: unknown };

interface AdminConversationMessage {
  messageId: string;
  conversationId: string;
  parentMessageId?: string;
  text?: string;
  content?: ContentPart[];
  sender: string;
  isCreatedByUser: boolean;
  createdAt: string;
  updatedAt?: string;
  endpoint?: string;
  model?: string;
}

interface AdminConversationMessagesResponse {
  conversation: AdminConversation;
  messages: AdminConversationMessage[];
}

// API functions inline since data-provider may not be rebuilt
const getAdminConversations = async (params?: {
  page?: number;
  limit?: number;
  userId?: string;
  endpoint?: string;
  search?: string;
  sortBy?: string;
  sortDirection?: string;
}): Promise<AdminConversationsResponse> => {
  const query = params
    ? '?' +
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const res = await fetch(`/api/admin/conversations${query}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
};

const getAdminConversationMessages = async (
  conversationId: string,
): Promise<AdminConversationMessagesResponse> => {
  const res = await fetch(`/api/admin/conversations/${conversationId}/messages`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
};

// Type definitions for admin users
interface AdminUser {
  _id: string;
  email: string;
  name?: string;
  username?: string;
  role?: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Fetch all users for the filter dropdown
const getAdminUsers = async (params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<AdminUsersResponse> => {
  const query = params
    ? '?' +
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const res = await fetch(`/api/admin/users${query}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
};

// Helper functions
const getEndpointLabel = (endpoint: string) => {
  const labels: Record<string, string> = {
    assistants: 'OpenAI 助手',
    azureAssistants: 'Azure 助手',
    agents: '智能体',
  };
  return labels[endpoint] || endpoint;
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Extract text content from a message.
 * For Assistants/Agents endpoints, content is stored in the `content` array.
 * For other endpoints, content is stored in the `text` field.
 */
const getMessageText = (message: AdminConversationMessage): string => {
  // Debug logging
  console.log('[getMessageText] Processing message:', {
    messageId: message.messageId,
    isCreatedByUser: message.isCreatedByUser,
    hasContent: !!message.content,
    contentLength: message.content?.length,
    hasText: !!message.text,
    content: message.content,
  });

  // First try to get text from the content array (for Assistants/Agents)
  if (message.content && Array.isArray(message.content) && message.content.length > 0) {
    let result = '';
    for (const part of message.content) {
      console.log('[getMessageText] Processing part:', part);
      if (part.type === 'text') {
        const textPart = part as TextContentPart;
        const textValue =
          typeof textPart.text === 'string' ? textPart.text : textPart.text?.value || '';
        console.log('[getMessageText] Extracted text value:', textValue);
        if (result.length > 0 && textValue.length > 0) {
          result += ' ';
        }
        result += textValue;
      } else if (part.type === 'think') {
        const thinkPart = part as ThinkContentPart;
        const thinkValue = typeof thinkPart.think === 'string' ? thinkPart.think : '';
        if (thinkValue && result.length > 0) {
          result += ' ';
        }
        result += thinkValue;
      }
    }
    if (result) {
      console.log('[getMessageText] Final result from content:', result);
      return result;
    }
  }

  // Fallback to text field
  console.log('[getMessageText] Falling back to text field:', message.text);
  return message.text || '';
};

// Conversation List Item Component
const ConversationListItem = memo(
  ({
    conversation,
    isSelected,
    onSelect,
  }: {
    conversation: AdminConversation;
    isSelected: boolean;
    onSelect: (conversation: AdminConversation) => void;
  }) => (
    <div
      onClick={() => onSelect(conversation)}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-l-2 border-transparent px-4 py-3 transition-colors',
        isSelected
          ? 'border-blue-500 bg-surface-secondary'
          : 'hover:bg-surface-secondary/50 border-transparent',
      )}
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-active">
        <MessageSquare size={16} className="text-text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-text-primary">{conversation.title || '新对话'}</div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="flex items-center gap-1">
            <Bot size={10} />
            {getEndpointLabel(conversation.endpoint)}
          </span>
          <span>•</span>
          <span>{formatDate(conversation.updatedAt)}</span>
        </div>
      </div>
    </div>
  ),
);

ConversationListItem.displayName = 'ConversationListItem';

// Messages Panel Component
const MessagesPanel = memo(
  ({
    conversation,
    isLoading,
    messages,
    onClose,
  }: {
    conversation: AdminConversation | null;
    isLoading: boolean;
    messages: AdminConversationMessage[] | undefined;
    onClose: () => void;
  }) => {
    if (!conversation) {
      return (
        <div className="flex h-full flex-col items-center justify-center bg-surface-secondary">
          <MessageSquare className="mb-2 h-12 w-12 text-text-secondary opacity-50" />
          <p className="text-sm text-text-secondary">选择一个对话查看详情</p>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col overflow-hidden bg-surface-primary">
        {/* Header */}
        <div className="border-b border-border-light bg-surface-secondary p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-text-primary">
                {conversation.title || '新对话'}
              </h2>
              <div className="mt-2 space-y-1">
                {conversation.userInfo && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <UserIcon size={12} />
                    <span>{conversation.userInfo.name || conversation.userInfo.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Bot size={12} />
                  <span>{getEndpointLabel(conversation.endpoint)}</span>
                  <span>•</span>
                  <span>{formatDate(conversation.updatedAt)}</span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 flex-shrink-0 p-0 md:hidden"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={16} />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : messages?.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <p className="text-sm text-text-secondary">暂无消息</p>
            </div>
          ) : (
            messages?.map((message) => (
              <div
                key={message.messageId}
                className={cn(
                  'rounded-lg p-4',
                  message.isCreatedByUser
                    ? 'ml-8 bg-blue-50 dark:bg-blue-900/20'
                    : 'mr-8 bg-surface-tertiary',
                )}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      message.isCreatedByUser
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-green-600 dark:text-green-400',
                    )}
                  >
                    {message.isCreatedByUser ? '用户' : '助手'}
                  </span>
                  <span className="text-xs text-text-secondary">{formatDate(message.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-sm text-text-primary">
                  {getMessageText(message) || (
                    <span className="text-text-secondary italic">
                      [调试: content={JSON.stringify(message.content)}, text={message.text}]
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  },
);

MessagesPanel.displayName = 'MessagesPanel';

const AdminConversations: React.FC = () => {
  const localize = useLocalize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<string>('desc');
  const [selectedConversation, setSelectedConversation] = useState<AdminConversation | null>(null);

  // Fetch all users for the filter dropdown
  const { data: usersData } = useQuery<AdminUsersResponse>({
    queryKey: ['adminUsers'],
    queryFn: () => getAdminUsers({ limit: 1000 }),
  });

  // Fetch conversations
  const { data, isLoading } = useQuery<AdminConversationsResponse>({
    queryKey: [
      'adminConversations',
      page,
      search,
      selectedUserId,
      selectedEndpoint,
      sortBy,
      sortDirection,
    ],
    queryFn: () =>
      getAdminConversations({
        page,
        limit: 20,
        search: search || undefined,
        userId: selectedUserId || undefined,
        endpoint: selectedEndpoint || undefined,
        sortBy,
        sortDirection,
      }),
  });

  // Fetch messages for selected conversation
  const { data: messagesData, isLoading: isMessagesLoading } =
    useQuery<AdminConversationMessagesResponse>({
      queryKey: ['adminConversationMessages', selectedConversation?.conversationId],
      queryFn: () =>
        getAdminConversationMessages(selectedConversation?.conversationId || ''),
      enabled: !!selectedConversation?.conversationId,
    });

  const handleViewMessages = useCallback((conversation: AdminConversation) => {
    setSelectedConversation(conversation);
  }, []);

  const handleCloseMessages = useCallback(() => {
    setSelectedConversation(null);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-surface-primary">
      {/* Left Panel - Conversations List */}
      <div className="flex w-full flex-col border-r border-border-light md:w-96">
        <div className="flex-shrink-0 border-b border-border-light bg-surface-secondary p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-text-primary">对话管理</h1>
            <p className="mt-1 text-xs text-text-secondary">查看所有用户的对话记录</p>
          </div>

          {/* Filters */}
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                type="text"
                placeholder="搜索..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10 text-sm"
              />
            </div>

            {/* Endpoint Filter */}
            <Select
              value={selectedEndpoint}
              onValueChange={(value) => {
                setSelectedEndpoint(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="所有类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有类型</SelectItem>
                <SelectItem value="assistants">OpenAI 助手</SelectItem>
                <SelectItem value="azureAssistants">Azure 助手</SelectItem>
                <SelectItem value="agents">智能体</SelectItem>
              </SelectContent>
            </Select>

            {/* User Filter */}
            <Select
              value={selectedUserId}
              onValueChange={(value) => {
                setSelectedUserId(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <div className="flex items-center gap-2">
                  <UserIcon size={14} />
                  <SelectValue placeholder="选择用户查看对话" />
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="all">所有用户</SelectItem>
                {usersData?.users?.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.name || user.username || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select
              value={`${sortBy}-${sortDirection}`}
              onValueChange={(value) => {
                const [field, direction] = value.split('-');
                setSortBy(field);
                setSortDirection(direction);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAt-desc">最近更新</SelectItem>
                <SelectItem value="updatedAt-asc">最早更新</SelectItem>
                <SelectItem value="createdAt-desc">最新创建</SelectItem>
                <SelectItem value="createdAt-asc">最早创建</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : data?.conversations.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-text-secondary">未找到对话记录</p>
            </div>
          ) : (
            <div className="divide-y divide-border-light">
              {data?.conversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.conversationId}
                  conversation={conversation}
                  isSelected={selectedConversation?.conversationId === conversation.conversationId}
                  onSelect={handleViewMessages}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex-shrink-0 border-t border-border-light bg-surface-secondary p-3">
            <div className="mb-2 text-center text-xs text-text-secondary">
              {data.pagination.page} / {data.pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={14} />
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pagination.totalPages}
              >
                下一页
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Messages */}
      <div className="hidden w-0 flex-1 flex-col md:flex">
        <MessagesPanel
          conversation={selectedConversation}
          isLoading={isMessagesLoading}
          messages={messagesData?.messages}
          onClose={handleCloseMessages}
        />
      </div>

      {/* Mobile Panel - Messages (shown when conversation is selected on mobile) */}
      {selectedConversation && (
        <div className="absolute bottom-0 left-0 right-0 top-0 z-40 flex flex-col bg-surface-primary md:hidden">
          <MessagesPanel
            conversation={selectedConversation}
            isLoading={isMessagesLoading}
            messages={messagesData?.messages}
            onClose={handleCloseMessages}
          />
        </div>
      )}
    </div>
  );
};

export default AdminConversations;
