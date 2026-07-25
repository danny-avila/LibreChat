import { useRef, useState, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { isImportJobStarted } from 'librechat-data-provider';
import type { TImportResponse } from 'librechat-data-provider';
import {
  useGetStartupConfig,
  useUploadImportMutation,
  useStartImportMutation,
  useCancelImportMutation,
  useImportJobQuery,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import Dropzone from './Dropzone';
import Progress from './Progress';
import Loading from './Loading';
import Summary from './Summary';

function getUploadErrorMessage(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message;
}

export default function Import() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [jobId, setJobId] = useState<string | null>(null);
  const cameFromResetRef = useRef(false);

  const { data: startupConfig } = useGetStartupConfig();
  const { data: job } = useImportJobQuery(jobId);

  const uploadMutation = useUploadImportMutation({
    onSuccess: (data: TImportResponse) => {
      if (isImportJobStarted(data)) {
        setJobId(data.jobId);
        return;
      }
      showToast({ message: data.message, severity: NotificationSeverity.SUCCESS });
    },
    onError: (error: unknown) => {
      const isUnsupportedType = getUploadErrorMessage(error) === 'Unsupported import type';
      showToast({
        message: localize(
          isUnsupportedType
            ? 'com_ui_import_conversation_file_type_error'
            : 'com_ui_import_conversation_upload_error',
        ),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const startMutation = useStartImportMutation({
    onError: () => {
      showToast({
        message: localize('com_ui_import_conversation_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const cancelMutation = useCancelImportMutation();

  const handleFile = useCallback(
    (file: File) => {
      const maxFileSize = startupConfig?.conversationImportMaxFileSize;
      if (maxFileSize != null && file.size > maxFileSize) {
        showToast({
          message: localize('com_error_files_upload_too_large', {
            0: (maxFileSize / (1024 * 1024)).toFixed(2),
          }),
          severity: NotificationSeverity.ERROR,
        });
        return;
      }

      const formData = new FormData();
      formData.append('file', file, encodeURIComponent(file.name || 'File'));
      uploadMutation.mutate(formData);
    },
    [localize, showToast, startupConfig, uploadMutation],
  );

  const handleConfirm = useCallback(() => {
    if (jobId != null) {
      startMutation.mutate(jobId);
    }
  }, [jobId, startMutation]);

  const handleCancel = useCallback(() => {
    if (jobId != null) {
      cancelMutation.mutate(jobId);
    }
  }, [jobId, cancelMutation]);

  const handleReset = useCallback(() => {
    cameFromResetRef.current = true;
    setJobId(null);
  }, []);

  const showSummary = job?.phase === 'awaiting_confirmation' && job.summary != null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">{localize('com_ui_import_info')}</p>

      {jobId == null && (
        <Dropzone
          onFile={handleFile}
          isUploading={uploadMutation.isLoading}
          focusOnMount={cameFromResetRef.current}
        />
      )}

      {jobId != null && job == null && <Loading />}

      {job != null && showSummary && job.summary != null && (
        <Summary
          summary={job.summary}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isConfirming={startMutation.isLoading}
          isCancelling={cancelMutation.isLoading}
        />
      )}

      {job != null && !showSummary && (
        <Progress
          job={job}
          onCancel={handleCancel}
          onReset={handleReset}
          isCancelling={cancelMutation.isLoading}
        />
      )}
    </div>
  );
}
