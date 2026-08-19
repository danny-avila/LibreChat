import { useState, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import { EToolResources, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { forceResize, nextPastedTextFilename } from '~/utils';
import { useDeleteFilesMutation, useGetFiles } from '~/data-provider';
import { useChatContext, useChatFormContext } from '~/Providers';
import useFileUploadRouter from './useFileUploadRouter';
import useFileDeletion from './useFileDeletion';
import { useLocalize } from '~/hooks';

/** The attachment being edited, with its text already resolved so the dialog stays controlled. */
export type PastedTextEdit = {
  file: ExtendedFile;
  text: string;
};

/**
 * Backs the paste editor: resolves an attached `pasted-text.txt` back to the text it holds, and
 * applies an edit either as a replacement attachment or by returning the text to the composer.
 */
export default function usePastedTextEdit({
  files,
  setFiles,
  textAreaRef,
}: {
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { conversation } = useChatContext();
  const methods = useChatFormContext();
  const routeFiles = useFileUploadRouter();
  const { data: fileList } = useGetFiles<TFile[]>();
  const [editing, setEditing] = useState<PastedTextEdit | null>(null);

  const { mutateAsync } = useDeleteFilesMutation();
  const { deleteFile } = useFileDeletion({ mutateAsync });

  /** The in-memory blob is the only current copy right after an edit; the file record is the
   * only copy left once the composer was rebuilt from a draft. */
  const resolveText = useCallback(
    async (file: ExtendedFile): Promise<string | null> => {
      if (file.file != null) {
        try {
          return await file.file.text();
        } catch {
          // Fall through to the stored copy rather than failing the open.
        }
      }
      const stored = fileList?.find((entry) => entry.file_id === file.file_id)?.text;
      return stored != null && stored !== '' ? stored : null;
    },
    [fileList],
  );

  const openEditor = useCallback(
    async (file: ExtendedFile) => {
      const text = await resolveText(file);
      if (text == null) {
        showToast({ message: localize('com_ui_pasted_text_unavailable'), status: 'error' });
        return;
      }
      setEditing({ file, text });
    },
    [resolveText, showToast, localize],
  );

  const closeEditor = useCallback(() => setEditing(null), []);

  /** Removes the chip locally first so a replacement can reuse the composer slot immediately. */
  const detach = useCallback(
    (file: ExtendedFile) => {
      deleteFile({ file, setFiles });
    },
    [deleteFile, setFiles],
  );

  const saveEdit = useCallback(
    async (text: string) => {
      if (editing == null) {
        return;
      }
      const { file } = editing;
      /** Uploads are deduped on name + size + type, and an edit that preserves length would
       * otherwise collide with the attachment it replaces. A free name cannot. */
      const attachedFilenames = new Set(
        Array.from(files.values()).map(
          (attached) => attached.file?.name ?? attached.filename ?? '',
        ),
      );
      const replacement = new File([text], nextPastedTextFilename(attachedFilenames), {
        type: 'text/plain',
      });
      const toolResource =
        (file.tool_resource as EToolResources | undefined) ??
        (isAssistantsEndpoint(conversation?.endpoint) ? undefined : EToolResources.context);

      setEditing(null);
      detach(file);
      const accepted = await routeFiles([replacement], toolResource);
      if (!accepted) {
        showToast({ message: localize('com_ui_pasted_text_save_error'), status: 'error' });
      }
    },
    [editing, files, conversation?.endpoint, detach, routeFiles, showToast, localize],
  );

  /**
   * Drops the attachment and appends its text to the composer. The caret the paste came from is
   * long gone by now, so this lands at the end rather than guessing at an offset.
   *
   * The write goes through the form rather than `insertTextAtCursor`: that helper needs the
   * textarea focused for `execCommand`, and the chip that was clicked is being unmounted as this
   * runs, so the insert silently did nothing. The manual `input` event stands in for the one
   * `execCommand` would have fired, which is what tells autosave to write the draft.
   */
  const moveInline = useCallback(
    async (file: ExtendedFile) => {
      const text = await resolveText(file);
      if (text == null) {
        showToast({ message: localize('com_ui_pasted_text_unavailable'), status: 'error' });
        return;
      }

      setEditing((current) => (current?.file.file_id === file.file_id ? null : current));
      detach(file);

      const textArea = textAreaRef.current;
      const current = textArea?.value ?? methods.getValues('text') ?? '';
      const next = current.length > 0 ? `${current}\n${text}` : text;
      methods.setValue('text', next, { shouldDirty: true, shouldValidate: true });

      if (textArea == null) {
        return;
      }
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      forceResize(textArea);
      textArea.focus();
      textArea.setSelectionRange(next.length, next.length);
    },
    [resolveText, showToast, localize, detach, textAreaRef, methods],
  );

  return { editing, openEditor, closeEditor, saveEdit, moveInline };
}
