import React, { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@librechat/client';
import type { GmailMessageSummary } from 'librechat-data-provider';
import { useMicrosoftOutlookMessagesQuery } from '~/data-provider';
import { useDebounce, useLocalize } from '~/hooks';
import { IntegrationPickerDialogShell } from './IntegrationPickerDialogShell';
import { isIntegrationReconnectApiError } from '~/utils/integrationReconnect';

interface MicrosoftOutlookMailPickerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMessagesSelected: (messages: GmailMessageSummary[]) => void;
  isAttaching?: boolean;
  maxSelectionCount?: number;
  onReconnect?: () => void;
}

export function MicrosoftOutlookMailPickerDialog({
  isOpen,
  onOpenChange,
  onMessagesSelected,
  isAttaching = false,
  maxSelectionCount,
  onReconnect,
}: MicrosoftOutlookMailPickerDialogProps) {
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [accumulatedMessages, setAccumulatedMessages] = useState<GmailMessageSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setPageToken(undefined);
      setAccumulatedMessages([]);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const { data, isLoading, isFetching, isError, error } = useMicrosoftOutlookMessagesQuery({
    query: debouncedSearch || undefined,
    pageToken,
    pageSize: 15,
    enabled: isOpen,
  });

  useEffect(() => {
    if (!data?.messages) {
      return;
    }

    setAccumulatedMessages((current) => {
      if (!pageToken) {
        return data.messages;
      }
      const existingIds = new Set(current.map((message) => message.id));
      const merged = [...current];
      for (const message of data.messages) {
        if (!existingIds.has(message.id)) {
          merged.push(message);
        }
      }
      return merged;
    });
  }, [data?.messages, pageToken]);

  const messages = useMemo(
    () => (pageToken ? accumulatedMessages : (data?.messages ?? [])),
    [pageToken, accumulatedMessages, data?.messages],
  );
  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedIds.has(message.id)),
    [messages, selectedIds],
  );

  const toggleSelection = (messageId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleAttach = () => {
    if (selectedMessages.length === 0) {
      return;
    }
    onMessagesSelected(selectedMessages);
  };

  const showReconnectError = isError && isIntegrationReconnectApiError(error);

  return (
    <IntegrationPickerDialogShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      titleKey="com_integrations_outlook_mail_picker_title"
      searchPlaceholderKey="com_integrations_outlook_mail_picker_search"
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPageToken(undefined);
        setAccumulatedMessages([]);
      }}
      isLoading={isLoading || (isFetching && messages.length === 0)}
      isAttaching={isAttaching}
      isError={showReconnectError}
      onReconnect={onReconnect}
      selectedCount={selectedIds.size}
      maxSelectionCount={maxSelectionCount}
      onAttach={handleAttach}
      hasMore={Boolean(data?.nextPageToken)}
      onLoadMore={() => setPageToken(data?.nextPageToken)}
    >
      {messages.length === 0 ? (
        <p className="p-4 text-sm text-text-secondary">
          {localize('com_integrations_picker_empty')}
        </p>
      ) : (
        <ul className="divide-token-border-light divide-y">
          {messages.map((message) => (
            <li key={message.id}>
              <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-surface-hover">
                <Checkbox
                  checked={selectedIds.has(message.id)}
                  onCheckedChange={() => toggleSelection(message.id)}
                  aria-label={message.subject}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {message.subject}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {message.from}
                    {message.date ? ` · ${message.date}` : ''}
                  </span>
                  {message.snippet && (
                    <span className="mt-1 line-clamp-2 block text-xs text-text-tertiary">
                      {message.snippet}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </IntegrationPickerDialogShell>
  );
}
