import { useMemo, useState } from 'react';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  useToastContext,
} from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useGetFiles } from '~/data-provider';
import type { ExtendedFile } from '~/common';
import store from '~/store';
import { isBklOcrReadyFile } from '~/utils';

const IMPORT_TITLE = '기존파일 임포트';
const SEARCH_PLACEHOLDER = '파일명 검색';
const LOADING_MESSAGE = '파일 목록을 불러오는 중입니다.';
const EMPTY_MESSAGE = '임포트할 수 있는 OCR 완료 파일이 없습니다.';
const ALREADY_ATTACHED_MESSAGE = '이미 현재 채팅에 첨부됨';
const SELECT_FILE_MESSAGE = '임포트할 파일을 선택하세요.';
const CANCEL_LABEL = '취소';
const IMPORT_LABEL = '임포트';

const toAttachedFile = (file: TFile): ExtendedFile => ({
  file_id: file.file_id,
  temp_file_id: file.temp_file_id,
  filepath: file.filepath,
  filename: file.filename,
  type: file.type,
  width: file.width,
  height: file.height,
  size: file.bytes,
  progress: 1,
  source: file.source,
  embedded: file.embedded,
  attached: true,
  metadata: file.metadata,
});

export default function ExistingFilesImportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const currentFiles = useRecoilValue(store.filesByIndex(0));
  const setFiles = useSetRecoilState(store.filesByIndex(0));
  const { showToast } = useToastContext();

  const attachedIds = useMemo(() => new Set(currentFiles.keys()), [currentFiles]);
  const { data: files = [], isLoading } = useGetFiles<TFile[]>({
    enabled: open,
    select: (files) => files.filter(isBklOcrReadyFile),
  });

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return files;
    }
    return files.filter((file) => file.filename.toLowerCase().includes(query));
  }, [files, search]);

  const selectedImportableFiles = useMemo(
    () => files.filter((file) => selectedIds.has(file.file_id) && !attachedIds.has(file.file_id)),
    [attachedIds, files, selectedIds],
  );

  const toggleFile = (file: TFile) => {
    if (attachedIds.has(file.file_id)) {
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(file.file_id)) {
        next.delete(file.file_id);
      } else {
        next.add(file.file_id);
      }
      return next;
    });
  };

  const handleImport = () => {
    if (selectedImportableFiles.length === 0) {
      showToast({
        message: SELECT_FILE_MESSAGE,
        status: 'warning',
      });
      return;
    }

    setFiles((current) => {
      const next = new Map(current);
      for (const file of selectedImportableFiles) {
        if (!next.has(file.file_id)) {
          next.set(file.file_id, toAttachedFile(file));
        }
      }
      return next;
    });

    setSelectedIds(new Set());
    onOpenChange(false);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        title={IMPORT_TITLE}
        className="w-11/12 bg-background text-text-primary shadow-2xl"
      >
        <OGDialogHeader>
          <OGDialogTitle>{IMPORT_TITLE}</OGDialogTitle>
        </OGDialogHeader>
        <div className="flex flex-col gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            className="w-full rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm outline-none focus:border-border-heavy"
          />
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border-light">
            {isLoading && (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                {LOADING_MESSAGE}
              </div>
            )}
            {!isLoading && filteredFiles.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                {EMPTY_MESSAGE}
              </div>
            )}
            {!isLoading &&
              filteredFiles.length > 0 &&
              filteredFiles.map((file) => {
                const checked = selectedIds.has(file.file_id);
                const attached = attachedIds.has(file.file_id);
                return (
                  <label
                    key={file.file_id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border-light px-4 py-3 last:border-b-0 hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      checked={checked || attached}
                      disabled={attached}
                      onChange={() => toggleFile(file)}
                      className="size-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" title={file.filename}>
                        {file.filename}
                      </span>
                      {attached ? (
                        <span className="text-xs text-text-secondary">
                          {ALREADY_ATTACHED_MESSAGE}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {CANCEL_LABEL}
            </Button>
            <Button type="button" onClick={handleImport}>
              {IMPORT_LABEL}
            </Button>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
