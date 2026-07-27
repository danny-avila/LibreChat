import { useMemo, useRef, useState } from 'react';
import { FileSources, FileContext, EToolResources } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '@librechat/client';
import type { ExtendedFile } from '~/common';
import { useFileHandlingNoChatContext } from '~/hooks/Files/useFileHandling';
import { useGetFiles } from '~/data-provider';
import { DataTable, columns } from './Table';
import FileRow from './FileRow';
import { useLocalize } from '~/hooks';
import { isBklOcrReadyFile, BKL_ALLOWED_UPLOAD_ACCEPT } from '~/utils';

export function MyFilesModal({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | HTMLDivElement | null>;
}) {
  const localize = useLocalize();

  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (files) =>
      files.filter(isBklOcrReadyFile).map((file) => {
        file.context = file.context ?? FileContext.unknown;
        file.filterSource = file.source === FileSources.firebase ? FileSources.local : file.source;
        return file;
      }),
  });

  // BKL: 라이브러리에서 직접 업로드. bkl_library 플래그로 서버가 미사용 TTL 을
  // 적용하지 않아(채팅 첨부와 달리) 전송 없이도 영구 보존된다.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Map<string, ExtendedFile>>(new Map());
  const fileHandlingState = useMemo(
    () => ({ files: uploads, setFiles: setUploads, conversation: null }),
    [uploads],
  );
  const { handleFileChange } = useFileHandlingNoChatContext(
    {
      additionalMetadata: { bkl_library: 'true' },
      fileSetter: setUploads,
    },
    fileHandlingState,
  );

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogContent
        title={localize('com_nav_my_files')}
        className="w-11/12 bg-background text-text-primary shadow-2xl"
      >
        <OGDialogHeader>
          <div className="flex items-center justify-between pr-6">
            <OGDialogTitle>{localize('com_nav_my_files')}</OGDialogTitle>
            <button
              type="button"
              className="rounded-lg border border-border-light bg-surface-primary px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-active-alt"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
                fileInputRef.current?.click();
              }}
            >
              + {localize('com_ui_upload_files')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept={BKL_ALLOWED_UPLOAD_ACCEPT}
              onChange={(e) => handleFileChange(e, EToolResources.context)}
            />
          </div>
        </OGDialogHeader>
        {/* 업로드 진행 중인 파일 — 완료되면 아래 목록(useGetFiles 캐시)에 나타난다 */}
        <FileRow
          files={uploads}
          setFiles={setUploads}
          fileFilter={(file: ExtendedFile) => (file.progress ?? 1) < 1}
          Wrapper={({ children }) => <div className="flex flex-wrap gap-2 px-1">{children}</div>}
        />
        <DataTable columns={columns} data={files} />
      </OGDialogContent>
    </OGDialog>
  );
}
