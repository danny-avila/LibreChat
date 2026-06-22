import React from 'react';
import {
  Button,
  Input,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  Spinner,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

interface IntegrationPickerDialogShellProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  titleKey: string;
  searchPlaceholderKey: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  isAttaching: boolean;
  selectedCount: number;
  maxSelectionCount?: number;
  onAttach: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isError?: boolean;
  errorDescriptionKey?: string;
  onReconnect?: () => void;
  children: React.ReactNode;
}

export function IntegrationPickerDialogShell({
  isOpen,
  onOpenChange,
  titleKey,
  searchPlaceholderKey,
  searchValue,
  onSearchChange,
  isLoading,
  isAttaching,
  selectedCount,
  maxSelectionCount,
  onAttach,
  onLoadMore,
  hasMore = false,
  isError = false,
  errorDescriptionKey = 'com_integrations_picker_reconnect_required',
  onReconnect,
  children,
}: IntegrationPickerDialogShellProps) {
  const localize = useLocalize();
  const attachDisabled =
    selectedCount === 0 ||
    isAttaching ||
    (maxSelectionCount != null && selectedCount > maxSelectionCount);

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-4">
        <OGDialogTitle>{localize(titleKey as Parameters<typeof localize>[0])}</OGDialogTitle>

        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={localize(searchPlaceholderKey as Parameters<typeof localize>[0])}
        />

        <div className="border-token-border-light min-h-[320px] flex-1 overflow-y-auto rounded-md border">
          {isLoading ? (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : isError ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-text-secondary">
                {localize(errorDescriptionKey as Parameters<typeof localize>[0])}
              </p>
              {onReconnect && (
                <Button variant="submit" onClick={onReconnect}>
                  {localize('com_integrations_reconnect_button')}
                </Button>
              )}
            </div>
          ) : (
            children
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-text-secondary">
            {localize('com_integrations_picker_selected', { count: selectedCount })}
          </span>
          <div className="flex gap-2">
            {hasMore && onLoadMore && (
              <Button variant="outline" onClick={onLoadMore} disabled={isLoading || isAttaching}>
                {localize('com_integrations_picker_load_more')}
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isAttaching}>
              {localize('com_ui_cancel')}
            </Button>
            <Button variant="submit" onClick={onAttach} disabled={attachDisabled}>
              {isAttaching ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {localize('com_ui_loading')}
                </>
              ) : (
                localize('com_integrations_picker_attach')
              )}
            </Button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
