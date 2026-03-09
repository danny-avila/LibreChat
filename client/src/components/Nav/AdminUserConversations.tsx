import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import { MessageSquare, ChevronDown, ChevronUp, Eye, Bot, Clock } from 'lucide-react';
import { Spinner, Button, useMediaQuery } from '@librechat/client';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type LocalizeFn = ReturnType<typeof useLocalize>;

// Type definitions
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

// Helper functions
const getEndpointLabel = (endpoint: string, localize: LocalizeFn) => {
  const labels: Record<string, string> = {
    assistants: localize('com_admin_conv_endpoint_assistants'),
    azureAssistants: localize('com_admin_conv_endpoint_azure_assistants'),
    agents: localize('com_admin_conv_endpoint_agents'),
    gptPlugins: localize('com_admin_conv_endpoint_gpt_plugins'),
    openAI: 'OpenAI',
    google: 'Google',
    anthropic: 'Anthropic',
  };
  return labels[endpoint] || endpoint;
};

const formatDate = (
  dateString: string,
  localize: LocalizeFn,
) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (diffDays === 1) {
    return localize('com_admin_conv_yesterday');
  } else if (diffDays < 7) {
    return localize('com_admin_conv_days_ago', { count: diffDays });
  }
  return date.toLocaleDateString(undefined, {
    month: '2-digit',
    day: '2-digit',
  });
};

const formatFullDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Conversation Item Component
const ConversationItem = memo(
  ({
    conversation,
    onViewMessages,
    localize,
  }: {
    conversation: AdminConversation;
    onViewMessages: (conv: AdminConversation) => void;
    localize: LocalizeFn;
  }) => {
    return (
      <div
        className={cn(
          'group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors',
          'hover:bg-surface-secondary cursor-pointer',
        )}
        onClick={() => onViewMessages(conversation)}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-tertiary">
          <MessageSquare size={14} className="text-text-secondary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">
            {conversation.title || localize('com_admin_conv_new_conversation')}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span className="flex items-center gap-1">
              <Bot size={10} />
              {getEndpointLabel(conversation.endpoint, localize)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatDate(conversation.updatedAt, localize)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onViewMessages(conversation);
          }}
        >
          <Eye size={14} />
        </Button>
      </div>
    );
  },
);

ConversationItem.displayName = 'ConversationItem';

// Messages Dialog Component
const MessagesDialog = memo(
  ({
    isOpen,
    onClose,
    conversation,
    localize,
  }: {
    isOpen: boolean;
    onClose: () => void;
    conversation: AdminConversation | null;
    localize: LocalizeFn;
  }) => {
    const { data, isLoading } = useQuery<AdminConversationMessagesResponse>({
      queryKey: ['adminConversationMessages', conversation?.conversationId],
      queryFn: () => dataService.getAdminConversationMessages(conversation?.conversationId || ''),
      enabled: !!conversation?.conversationId && isOpen,
    });

    return (
      <OGDialog open={isOpen} onOpenChange={onClose}>
        <OGDialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
          <OGDialogHeader>
            <OGDialogTitle className="truncate pr-8">
              {conversation?.title || localize('com_admin_conv_new_conversation')}
            </OGDialogTitle>
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="flex items-center gap-1">
                <Bot size={12} />
                {conversation && getEndpointLabel(conversation.endpoint, localize)}
              </span>
              <span>•</span>
              <span>{conversation && formatFullDate(conversation.updatedAt)}</span>
            </div>
          </OGDialogHeader>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : data?.messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-secondary">{localize('com_admin_conv_no_messages')}</div>
            ) : (
              data?.messages.map((message) => (
                <div
                  key={message.messageId}
                  className={cn(
                    'rounded-lg p-3',
                    message.isCreatedByUser
                      ? 'ml-8 bg-blue-50 dark:bg-blue-900/20'
                      : 'mr-8 bg-surface-tertiary',
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xs font-medium',
                        message.isCreatedByUser
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-green-600 dark:text-green-400',
                      )}
                    >
                      {message.isCreatedByUser
                        ? localize('com_admin_conv_sender_user')
                        : localize('com_admin_conv_sender_assistant')}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {formatFullDate(message.createdAt)}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm text-text-primary">
                    {message.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </OGDialogContent>
      </OGDialog>
    );
  },
);

MessagesDialog.displayName = 'MessagesDialog';

// Main Component
const AdminUserConversations: React.FC = memo(() => {
  const localize = useLocalize();
  const selectedUser = useRecoilValue(store.adminSelectedUser);
  const isAdminViewMode = useRecoilValue(store.isAdminViewMode);
  const [page, setPage] = useState(1);
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<AdminConversation | null>(null);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);

  // Fetch conversations
  const { data, isLoading } = useQuery<AdminConversationsResponse>({
    queryKey: ['adminUserConversations', selectedUser?._id, page],
    queryFn: () =>
      dataService.getAdminConversations({
        userId: selectedUser?._id || '',
        page,
        limit: 50,
      }),
    enabled: !!selectedUser?._id && isAdminViewMode,
    staleTime: 30000,
  });

  const handleViewMessages = useCallback((conversation: AdminConversation) => {
    setSelectedConversation(conversation);
    setIsMessagesOpen(true);
  }, []);

  const handleCloseMessages = useCallback(() => {
    setIsMessagesOpen(false);
    setSelectedConversation(null);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Don't render if not in admin view mode or no user selected
  if (!isAdminViewMode || !selectedUser) {
    return null;
  }

  return (
    <>
      <div className="flex flex-col">
        {/* Header */}
        <button
          onClick={toggleExpanded}
          className="flex items-center justify-between px-1 py-2 text-xs font-bold text-text-secondary"
        >
          <span>
            {localize('com_admin_conv_user_conversations', {
              name: selectedUser.name || selectedUser.username || selectedUser.email,
            })}
            {data && ` (${data.pagination.total})`}
          </span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Conversations List */}
        {isExpanded && (
          <div className="max-h-[50vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="h-4 w-4" />
              </div>
            ) : data?.conversations.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-secondary">{localize('com_admin_conv_no_user_conversations')}</div>
            ) : (
              <>
                <div className="space-y-1">
                  {data?.conversations.map((conversation) => (
                    <ConversationItem
                      key={conversation.conversationId}
                      conversation={conversation}
                      onViewMessages={handleViewMessages}
                        localize={localize}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {data && data.pagination.totalPages > 1 && (
                  <div className="mt-2 flex items-center justify-between px-2 text-xs">
                    <span className="text-text-secondary">
                      {page} / {data.pagination.totalPages}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        {localize('com_admin_prev_page')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= data.pagination.totalPages}
                      >
                        {localize('com_admin_next_page')}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Messages Dialog */}
      <MessagesDialog
        isOpen={isMessagesOpen}
        onClose={handleCloseMessages}
        conversation={selectedConversation}
        localize={localize}
      />
    </>
  );
});

AdminUserConversations.displayName = 'AdminUserConversations';

export default AdminUserConversations;
