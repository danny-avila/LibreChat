import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
} from 'lucide-react';
import { useLocalize } from '~/hooks';

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

interface AdminConversationMessage {
  messageId: string;
  conversationId: string;
  parentMessageId?: string;
  text: string;
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

const AdminConversations: React.FC = () => {
  const localize = useLocalize();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('updatedAt');
  const [sortDirection, setSortDirection] = useState<string>('desc');
  const [selectedConversation, setSelectedConversation] = useState<AdminConversation | null>(null);
  const [isMessagesDialogOpen, setIsMessagesDialogOpen] = useState(false);

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
      enabled: !!selectedConversation?.conversationId && isMessagesDialogOpen,
    });

  const handleViewMessages = useCallback((conversation: AdminConversation) => {
    setSelectedConversation(conversation);
    setIsMessagesDialogOpen(true);
  }, []);

  const handleCloseMessages = useCallback(() => {
    setIsMessagesDialogOpen(false);
    setSelectedConversation(null);
  }, []);

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

  return (
    <div className="h-full w-full overflow-auto bg-surface-primary p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-text-primary">对话管理</h1>
          <p className="mt-1 text-sm text-text-secondary">查看所有用户的助手和智能体对话记录</p>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            <Input
              type="text"
              placeholder="搜索对话标题..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10"
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
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="所有类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有类型</SelectItem>
              <SelectItem value="assistants">OpenAI 助手</SelectItem>
              <SelectItem value="azureAssistants">Azure 助手</SelectItem>
              <SelectItem value="agents">智能体</SelectItem>
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
            <SelectTrigger className="w-[180px]">
              <Clock className="mr-2 h-4 w-4" />
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">最近更新</SelectItem>
              <SelectItem value="updatedAt-asc">最早更新</SelectItem>
              <SelectItem value="createdAt-desc">最新创建</SelectItem>
              <SelectItem value="createdAt-asc">最早创建</SelectItem>
              <SelectItem value="title-asc">标题 A-Z</SelectItem>
              <SelectItem value="title-desc">标题 Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conversations Table */}
        <div className="overflow-hidden rounded-lg border border-border-light bg-surface-secondary">
          <table className="w-full">
            <thead className="bg-surface-tertiary">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  对话
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  更新时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    加载中...
                  </td>
                </tr>
              ) : data?.conversations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    未找到对话记录
                  </td>
                </tr>
              ) : (
                data?.conversations.map((conversation) => (
                  <tr key={conversation.conversationId} className="hover:bg-surface-tertiary">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-active">
                          <MessageSquare size={20} className="text-text-secondary" />
                        </div>
                        <div className="max-w-xs">
                          <div className="truncate font-medium text-text-primary">
                            {conversation.title || '新对话'}
                          </div>
                          <div className="text-xs text-text-secondary">
                            ID: {conversation.conversationId.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {conversation.userInfo?.avatar ? (
                          <img
                            src={conversation.userInfo.avatar}
                            alt={conversation.userInfo.name || conversation.userInfo.email}
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-active">
                            <UserIcon size={16} className="text-text-secondary" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-text-primary">
                            {conversation.userInfo?.name || conversation.userInfo?.username || '-'}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {conversation.userInfo?.email || '-'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        <Bot size={12} />
                        {getEndpointLabel(conversation.endpoint)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {formatDate(conversation.updatedAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewMessages(conversation)}
                      >
                        <MessageSquare size={16} className="mr-1" />
                        查看消息
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-text-secondary">
              共 {data.pagination.total} 个对话，第 {data.pagination.page} /{' '}
              {data.pagination.totalPages} 页
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} />
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.pagination.totalPages}
              >
                下一页
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Messages Dialog */}
        <OGDialog open={isMessagesDialogOpen} onOpenChange={handleCloseMessages}>
          <OGDialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <OGDialogHeader>
              <OGDialogTitle>
                对话详情 - {selectedConversation?.title || '新对话'}
              </OGDialogTitle>
              {selectedConversation?.userInfo && (
                <div className="text-sm text-text-secondary mt-1">
                  用户: {selectedConversation.userInfo.name || selectedConversation.userInfo.email}
                </div>
              )}
            </OGDialogHeader>
            <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-2">
              {isMessagesLoading ? (
                <div className="text-center text-text-secondary py-8">加载消息中...</div>
              ) : messagesData?.messages.length === 0 ? (
                <div className="text-center text-text-secondary py-8">暂无消息</div>
              ) : (
                messagesData?.messages.map((message) => (
                  <div
                    key={message.messageId}
                    className={`rounded-lg p-4 ${
                      message.isCreatedByUser
                        ? 'bg-blue-50 dark:bg-blue-900/20 ml-8'
                        : 'bg-surface-tertiary mr-8'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-xs font-medium ${
                          message.isCreatedByUser
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {message.isCreatedByUser ? '用户' : '助手'}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {formatDate(message.createdAt)}
                      </span>
                    </div>
                    <div className="text-text-primary whitespace-pre-wrap break-words">
                      {message.text}
                    </div>
                  </div>
                ))
              )}
            </div>
          </OGDialogContent>
        </OGDialog>
      </div>
    </div>
  );
};

export default AdminConversations;
