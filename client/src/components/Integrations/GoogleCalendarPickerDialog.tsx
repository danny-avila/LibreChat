import React, { useEffect, useMemo, useState } from 'react';
import { Checkbox } from '@librechat/client';
import type { GoogleCalendarEventSummary } from 'librechat-data-provider';
import { useGoogleCalendarEventsQuery } from '~/data-provider';
import { useDebounce, useLocalize } from '~/hooks';
import { IntegrationPickerDialogShell } from './IntegrationPickerDialogShell';

import { isIntegrationReconnectApiError } from '~/utils/integrationReconnect';

interface GoogleCalendarPickerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEventsSelected: (events: GoogleCalendarEventSummary[]) => void;
  isAttaching?: boolean;
  maxSelectionCount?: number;
  onReconnect?: () => void;
}

export function GoogleCalendarPickerDialog({
  isOpen,
  onOpenChange,
  onEventsSelected,
  isAttaching = false,
  maxSelectionCount,
  onReconnect,
}: GoogleCalendarPickerDialogProps) {
  const localize = useLocalize();
  const [search, setSearch] = useState('');
  const [pageToken, setPageToken] = useState<string | undefined>();
  const [accumulatedEvents, setAccumulatedEvents] = useState<GoogleCalendarEventSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search, 300);

  const timeRange = useMemo(() => {
    const now = new Date();
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return {
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setPageToken(undefined);
      setAccumulatedEvents([]);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const { data, isLoading, isFetching, isError, error } = useGoogleCalendarEventsQuery({
    query: debouncedSearch || undefined,
    pageToken,
    pageSize: 15,
    timeMin: timeRange.timeMin,
    timeMax: timeRange.timeMax,
    enabled: isOpen,
  });

  useEffect(() => {
    if (!data?.events) {
      return;
    }

    setAccumulatedEvents((current) => {
      if (!pageToken) {
        return data.events;
      }
      const existingIds = new Set(current.map((event) => event.id));
      const merged = [...current];
      for (const event of data.events) {
        if (!existingIds.has(event.id)) {
          merged.push(event);
        }
      }
      return merged;
    });
  }, [data?.events, pageToken]);

  const events = useMemo(
    () => (pageToken ? accumulatedEvents : (data?.events ?? [])),
    [pageToken, accumulatedEvents, data?.events],
  );
  const selectedEvents = useMemo(
    () => events.filter((event) => selectedIds.has(event.id)),
    [events, selectedIds],
  );

  const toggleSelection = (eventId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const handleAttach = () => {
    if (selectedEvents.length === 0) {
      return;
    }
    onEventsSelected(selectedEvents);
  };

  const showReconnectError = isError && isIntegrationReconnectApiError(error);

  return (
    <IntegrationPickerDialogShell
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      titleKey="com_integrations_calendar_picker_title"
      searchPlaceholderKey="com_integrations_calendar_picker_search"
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPageToken(undefined);
        setAccumulatedEvents([]);
      }}
      isLoading={isLoading || (isFetching && events.length === 0)}
      isAttaching={isAttaching}
      isError={showReconnectError}
      onReconnect={onReconnect}
      selectedCount={selectedIds.size}
      maxSelectionCount={maxSelectionCount}
      onAttach={handleAttach}
      hasMore={Boolean(data?.nextPageToken)}
      onLoadMore={() => setPageToken(data?.nextPageToken)}
    >
      {events.length === 0 ? (
        <p className="p-4 text-sm text-text-secondary">
          {localize('com_integrations_picker_empty')}
        </p>
      ) : (
        <ul className="divide-token-border-light divide-y">
          {events.map((event) => (
            <li key={event.id}>
              <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-surface-hover">
                <Checkbox
                  checked={selectedIds.has(event.id)}
                  onCheckedChange={() => toggleSelection(event.id)}
                  aria-label={event.summary}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {event.summary}
                  </span>
                  <span className="block truncate text-xs text-text-secondary">
                    {event.start ?? ''}
                    {event.end ? ` – ${event.end}` : ''}
                  </span>
                  {event.location && (
                    <span className="mt-1 block truncate text-xs text-text-tertiary">
                      {event.location}
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
