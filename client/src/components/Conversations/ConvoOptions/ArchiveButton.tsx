import React, { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Spinner,
  Checkbox,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  useToastContext,
} from '@librechat/client';
import { useArchiveConvoMutation } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { NotificationSeverity } from '~/common';

/**
 * BKL: 아카이브 확인 다이얼로그.
 * 이 대화 전용 첨부 파일을 함께 삭제할 수 있는 옵션을 제공한다.
 */
export default function ArchiveButton({
  conversationId,
  retainView,
  showArchiveDialog,
  setShowArchiveDialog,
  triggerRef,
  setMenuOpen,
}: {
  conversationId: string;
  retainView: () => void;
  showArchiveDialog: boolean;
  setShowArchiveDialog: (value: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
  setMenuOpen?: (open: boolean) => void;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const archiveMutation = useArchiveConvoMutation();

  const confirmArchive = useCallback(() => {
    archiveMutation.mutate(
      { conversationId, isArchived: true, deleteFiles },
      {
        onSuccess: () => {
          setShowArchiveDialog(false);
          if (currentConvoId === conversationId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
          }
          retainView();
          setMenuOpen?.(false);
        },
        onError: () => {
          showToast({
            message: localize('com_ui_archive_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  }, [
    archiveMutation,
    conversationId,
    currentConvoId,
    deleteFiles,
    localize,
    navigate,
    newConversation,
    retainView,
    setMenuOpen,
    setShowArchiveDialog,
    showToast,
  ]);

  if (!conversationId) {
    return null;
  }

  return (
    <OGDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog} triggerRef={triggerRef}>
      <OGDialogContent
        className="w-11/12 max-w-md"
        showCloseButton={false}
        aria-describedby="archive-conversation-description"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_archive')}</OGDialogTitle>
        </OGDialogHeader>
        <div id="archive-conversation-description" className="w-full">
          이 채팅을 아카이브하시겠습니까?
        </div>
        <label className="flex cursor-pointer items-start gap-2 pt-2 text-sm text-text-primary">
          <Checkbox
            aria-label="이 채팅에 업로드된 파일도 함께 삭제"
            checked={deleteFiles}
            onCheckedChange={(checked) => setDeleteFiles(checked === true)}
            className="mt-0.5"
          />
          <span>
            이 채팅에 업로드된 파일도 함께 삭제
            <span className="block text-xs text-text-secondary">
              다른 채팅에서 사용 중인 파일은 유지됩니다.
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-4 pt-4">
          <OGDialogClose asChild>
            <Button aria-label="cancel" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </OGDialogClose>
          <Button onClick={confirmArchive} disabled={archiveMutation.isLoading}>
            {archiveMutation.isLoading ? <Spinner /> : localize('com_ui_archive')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
