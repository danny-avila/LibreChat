import { useState, useCallback } from 'react';
import { isImportJobStarted } from 'librechat-data-provider';
import { Spinner, useToastContext } from '@librechat/client';
import type { TImportResponse } from 'librechat-data-provider';
import {
  useUploadImportMutation,
  useStartImportMutation,
  useCancelImportMutation,
  useImportJobQuery,
} from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import Dropzone from './Dropzone';
import Progress from './Progress';
import Summary from './Summary';

export default function Import() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: job } = useImportJobQuery(jobId);

  const uploadMutation = useUploadImportMutation({
    onSuccess: (data: TImportResponse) => {
      if (isImportJobStarted(data)) {
        setJobId(data.jobId);
        return;
      }
      showToast({ message: data.message, severity: NotificationSeverity.SUCCESS });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_import_conversation_upload_error'),
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
      const formData = new FormData();
      formData.append('file', file, encodeURIComponent(file.name || 'File'));
      uploadMutation.mutate(formData);
    },
    [uploadMutation],
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
    setJobId(null);
  }, []);

  const showSummary = job?.phase === 'awaiting_confirmation' && job.summary != null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">{localize('com_ui_import_info')}</p>

      {jobId == null && <Dropzone onFile={handleFile} isUploading={uploadMutation.isLoading} />}

      {jobId != null && job == null && (
        <div className="flex items-center justify-center py-8">
          <Spinner className="size-6" />
        </div>
      )}

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
