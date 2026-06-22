import { useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { EToolResources } from 'librechat-data-provider';
import {
  useAttachGmailMessagesMutation,
  useAttachGoogleCalendarEventsMutation,
} from '~/data-provider';
import type { FileHandlingState } from './useFileHandling';
import useFileHandling, { useFileHandlingNoChatContext } from './useFileHandling';
import { integrationAttachedFilesToFiles } from '~/utils/integrationFiles';

interface UseIntegrationTextAttachProps {
  fileSetter?: unknown;
  toolResource?: string;
  providerLabel: string;
}

interface UseIntegrationTextAttachReturn {
  attachGmailMessages: (messageIds: string[]) => Promise<void>;
  attachCalendarEvents: (eventIds: string[]) => Promise<void>;
  isProcessing: boolean;
  error: string | null;
}

function useIntegrationTextAttach({
  onFilesDownloaded,
  onError,
  providerLabel,
}: {
  onFilesDownloaded?: (files: File[]) => void | Promise<void>;
  onError?: (error: Error) => void;
  providerLabel: string;
}) {
  const { showToast } = useToastContext();
  const [error, setError] = useState<string | null>(null);
  const gmailMutation = useAttachGmailMessagesMutation();
  const calendarMutation = useAttachGoogleCalendarEventsMutation();

  const attachItems = useCallback(
    async (ids: string[], type: 'gmail' | 'calendar') => {
      if (!ids.length) {
        throw new Error('No items selected');
      }

      setError(null);
      const isGmail = type === 'gmail';

      try {
        showToast({
          message: `Preparing ${ids.length} item(s) from ${providerLabel}...`,
          status: 'info',
          duration: 3000,
        });

        const response = isGmail
          ? await gmailMutation.mutateAsync(ids)
          : await calendarMutation.mutateAsync(ids);

        const files = integrationAttachedFilesToFiles(response.files);

        showToast({
          message: `Attached ${files.length} item(s) from ${providerLabel}`,
          status: 'success',
          duration: 4000,
        });

        if (onFilesDownloaded) {
          await onFilesDownloaded(files);
        }

        return files;
      } catch (attachError) {
        const errorMessage =
          attachError instanceof Error ? attachError.message : 'Unknown attach error';
        setError(errorMessage);

        showToast({
          message: `${providerLabel} attach failed: ${errorMessage}`,
          status: 'error',
          duration: 5000,
        });

        if (onError) {
          onError(attachError instanceof Error ? attachError : new Error(errorMessage));
        }

        throw attachError;
      }
    },
    [calendarMutation, gmailMutation, onError, onFilesDownloaded, providerLabel, showToast],
  );

  return {
    attachGmailMessages: (messageIds: string[]) => attachItems(messageIds, 'gmail'),
    attachCalendarEvents: (eventIds: string[]) => attachItems(eventIds, 'calendar'),
    isProcessing: gmailMutation.isLoading || calendarMutation.isLoading,
    error,
  };
}

export default function useIntegrationTextAttachHandling(
  props?: UseIntegrationTextAttachProps,
): UseIntegrationTextAttachReturn {
  const { handleFiles } = useFileHandling(props);
  const attach = useIntegrationTextAttach({
    providerLabel: props?.providerLabel ?? 'Integration',
    onFilesDownloaded: async (files) => {
      await handleFiles(files, props?.toolResource ?? EToolResources.context);
    },
  });

  return attach;
}

export function useIntegrationTextAttachHandlingNoChatContext(
  props: UseIntegrationTextAttachProps | undefined,
  fileState: FileHandlingState,
): UseIntegrationTextAttachReturn {
  const { handleFiles } = useFileHandlingNoChatContext(props, fileState);
  const attach = useIntegrationTextAttach({
    providerLabel: props?.providerLabel ?? 'Integration',
    onFilesDownloaded: async (files) => {
      await handleFiles(files, props?.toolResource ?? EToolResources.context);
    },
  });

  return attach;
}
