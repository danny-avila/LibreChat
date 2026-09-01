import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { useFileHandlingNoChatContext } from '~/hooks';
import FileRow from './FileRow';
import store from '~/store';

/**
 * Declared at module scope so its identity is stable across renders. An inline
 * wrapper is a new component type on every render, which remounts the whole file
 * row and silently drops keyboard focus mid-upload.
 */
const ChatFileRowWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-2 mt-2 flex flex-wrap gap-2">{children}</div>
);

function FileFormChat({
  index,
  conversation,
  files,
  setFiles,
  setFilesLoading,
  isPastedTextFile,
  isPasteActionPending,
  onEditPastedText,
  onMovePastedTextInline,
}: {
  index: number;
  conversation: TConversation | null;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Marks chips the composer generated from a long paste, so only those offer the paste
   * affordances. Filenames cannot carry that decision: users can upload a `pasted-text.txt`. */
  isPastedTextFile?: (file: ExtendedFile) => boolean;
  /** Hides the paste actions while a replacement upload or inline move is in flight for the
   * chip, so the same original cannot be acted on twice. */
  isPasteActionPending?: (file: ExtendedFile) => boolean;
  onEditPastedText?: (file: ExtendedFile) => void;
  onMovePastedTextInline?: (file: ExtendedFile) => void;
}) {
  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const { endpoint: _endpoint } = conversation ?? { endpoint: null };
  const { abortUpload } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });

  const isRTL = chatDirection === 'rtl';

  return (
    <>
      <FileRow
        files={files}
        index={index}
        setFiles={setFiles}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
        isRTL={isRTL}
        Wrapper={ChatFileRowWrapper}
        isPastedTextFile={isPastedTextFile}
        isPasteActionPending={isPasteActionPending}
        onEditPastedText={onEditPastedText}
        onMovePastedTextInline={onMovePastedTextInline}
      />
    </>
  );
}

export default memo(FileFormChat);
