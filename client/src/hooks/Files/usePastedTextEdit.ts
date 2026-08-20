import { useState, useCallback, useRef } from 'react';
import { v4 } from 'uuid';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import {
  dataService,
  EToolResources,
  FileSources,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import {
  addPastedTextDraftFile,
  forceResize,
  getComposerDraftId,
  markPastedTextFile,
  nextPastedTextFilename,
} from '~/utils';
import { useDeleteFilesMutation, useGetFiles } from '~/data-provider';
import { useChatContext, useChatFormContext } from '~/Providers';
import useFileUploadRouter from './useFileUploadRouter';
import { getNewConversationDraftToken } from '~/utils';
import { useAuthContext } from '~/hooks/AuthContext';
import useFileDeletion from './useFileDeletion';
import { useLocalize } from '~/hooks';
import store from '~/store';

/** The attachment being edited, with its text already resolved so the dialog stays controlled. */
export type PastedTextEdit = {
  file: ExtendedFile;
  text: string;
  /** The composer the dialog was opened in; an edit must never apply to a different one. */
  conversationId: string | null;
  /** Distinguishes two successive unsaved chats, which share the `new` conversation id. */
  draftToken: symbol;
};

/**
 * Backs the paste editor: resolves an attached `pasted-text.txt` back to the text it holds, and
 * applies an edit either as a replacement attachment or by returning the text to the composer.
 */
export default function usePastedTextEdit({
  index = 0,
  files,
  setFiles,
  textAreaRef,
}: {
  index?: number;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { user } = useAuthContext();
  const { conversation, isSubmitting } = useChatContext();
  const methods = useChatFormContext();
  const routeFiles = useFileUploadRouter();
  const { data: fileList } = useGetFiles<TFile[]>();
  const saveDrafts = useRecoilValue(store.saveDrafts);
  const [editing, setEditing] = useState<PastedTextEdit | null>(null);

  const { mutateAsync } = useDeleteFilesMutation();
  const { deleteFile } = useFileDeletion({ mutateAsync });

  const conversationId = conversation?.conversationId ?? null;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  /** Async resolves must re-check the composer against its current state, not the render the
   * callback was captured on. */
  const filesRef = useRef(files);
  filesRef.current = files;

  /** The dialog belongs to the composer it was opened in. Switching conversation or starting a
   * new chat retires it: saving from the new composer would detach that conversation's file and
   * upload the replacement into it. Reset on the render that observes the change. */
  if (
    editing != null &&
    (editing.conversationId !== conversationId ||
      editing.draftToken !== getNewConversationDraftToken(index))
  ) {
    setEditing(null);
  }

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
      if (stored != null && stored !== '') {
        return stored;
      }
      /** Assistants and agent uploads are persisted without a `text` field, so a paste restored
       * from a draft has no copy in memory or on its record; the stored bytes are the only
       * remaining source. */
      if (user?.id != null && (file.type ?? '').startsWith('text/')) {
        try {
          const response = await dataService.getFileDownload(user.id, file.file_id);
          const downloaded = await response.data.text();
          if (downloaded !== '') {
            return downloaded;
          }
        } catch {
          // Unreadable bytes leave the affordance to report the text as missing.
        }
      }
      return null;
    },
    [fileList, user?.id],
  );

  /** Whether a file is still one of this composer's unsent chips. The map is not always keyed by
   * the file's own id: a restored entry keeps its temporary upload id as the key while the value
   * carries the server-assigned one, so every identity is matched against keys and values. */
  const isAttachedToComposer = useCallback((file: ExtendedFile): boolean => {
    const identities = new Set([file.file_id]);
    if (file.temp_file_id != null && file.temp_file_id !== '') {
      identities.add(file.temp_file_id);
    }
    for (const [key, entry] of filesRef.current) {
      if (identities.has(key)) {
        return true;
      }
      if (
        (entry.file_id != null && identities.has(entry.file_id)) ||
        (entry.temp_file_id != null && identities.has(entry.temp_file_id))
      ) {
        return true;
      }
    }
    return false;
  }, []);

  const openEditor = useCallback(
    async (file: ExtendedFile) => {
      const conversationIdAtOpen = conversationIdRef.current;
      const draftTokenAtOpen = getNewConversationDraftToken(index);
      const text = await resolveText(file);
      if (text == null) {
        showToast({ message: localize('com_ui_pasted_text_unavailable'), status: 'error' });
        return;
      }
      /** The resolve can span a send, which clears the composer without changing either
       * identity. An editor for an attachment the message already took would save a replacement
       * into the empty composer, so it never opens. */
      if (
        conversationIdRef.current !== conversationIdAtOpen ||
        getNewConversationDraftToken(index) !== draftTokenAtOpen ||
        !isAttachedToComposer(file)
      ) {
        return;
      }
      setEditing({
        file,
        text,
        conversationId: conversationIdAtOpen,
        draftToken: draftTokenAtOpen,
      });
    },
    [resolveText, showToast, localize, index, isAttachedToComposer],
  );

  const closeEditor = useCallback(() => setEditing(null), []);

  /** Removes the chip locally and schedules the upload's deletion. A paste restored from a
   * draft carries `attached: true`, which makes `deleteFile` keep the server record because a
   * restored file is normally shared; a generated paste was created by this composer alone, so
   * its upload is deleted explicitly instead of being orphaned. */
  const detach = useCallback(
    (file: ExtendedFile) => {
      const restored = file.attached === true;
      deleteFile({ file, setFiles });
      if (restored && file.progress >= 1) {
        mutateAsync({
          files: [
            {
              file_id: file.file_id,
              embedded: file.embedded ?? false,
              filepath: file.filepath ?? '',
              source: file.source ?? FileSources.local,
            },
          ],
        });
      }
    },
    [deleteFile, setFiles, mutateAsync],
  );

  /** The composer an edit belongs to: same conversation, same unsaved-chat identity. */
  const isOriginatingComposer = useCallback(
    (editConversationId: string | null, editDraftToken: symbol) =>
      conversationIdRef.current === editConversationId &&
      getNewConversationDraftToken(index) === editDraftToken,
    [index],
  );

  const saveEdit = useCallback(
    async (text: string) => {
      if (editing == null) {
        return;
      }
      const { file, conversationId: editConversationId, draftToken: editDraftToken } = editing;
      /** Refuse a save from a composer the paste did not come from: the detach and the
       * replacement upload would otherwise land in whatever the user switched to. */
      if (!isOriginatingComposer(editConversationId, editDraftToken)) {
        setEditing(null);
        return;
      }
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
      /** The original stays until the replacement is stored. `routeFiles` resolving only means
       * the upload was accepted into the queue, and detaching first would leave neither copy
       * behind when the upload is rejected or fails. */
      const uploadId = v4();
      /** The replacement is itself a generated paste: without recording its provenance the
       * fresh chip immediately loses the Edit and Move back affordances it exists for. */
      markPastedTextFile(uploadId);
      if (saveDrafts) {
        addPastedTextDraftFile({
          id: getComposerDraftId(index, conversationIdRef.current, isSubmitting),
          fileId: uploadId,
        });
      }
      const accepted = await routeFiles([replacement], toolResource, {
        fileId: uploadId,
        shouldCommit: () => isOriginatingComposer(editConversationId, editDraftToken),
        onSuccess: () => {
          /** `shouldCommit` only gates the queue, not the request: the composer can change
           * while the upload itself is in flight, and so can the map, when the message this
           * file belongs to was sent in the meantime. Either way the original is no longer
           * this composer's unsent chip to remove. */
          if (
            isOriginatingComposer(editConversationId, editDraftToken) &&
            isAttachedToComposer(file)
          ) {
            detach(file);
          }
        },
      });
      if (!accepted) {
        showToast({ message: localize('com_ui_pasted_text_save_error'), status: 'error' });
      }
    },
    [
      editing,
      files,
      conversation?.endpoint,
      isOriginatingComposer,
      isAttachedToComposer,
      detach,
      routeFiles,
      showToast,
      localize,
      index,
      saveDrafts,
      isSubmitting,
    ],
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
      const conversationIdAtClick = conversationIdRef.current;
      const draftTokenAtClick = getNewConversationDraftToken(index);
      const text = await resolveText(file);
      if (text == null) {
        showToast({ message: localize('com_ui_pasted_text_unavailable'), status: 'error' });
        return;
      }
      /** The await can span a conversation switch or a new chat (two unsaved chats share one
       * conversation id, so the token is what distinguishes them), and the text would otherwise
       * be written into the composer the user navigated to while the original was detached from
       * this one. A send clears the map without changing either identity, so the chip must also
       * still be attached here for the move to be honest. */
      if (
        conversationIdRef.current !== conversationIdAtClick ||
        getNewConversationDraftToken(index) !== draftTokenAtClick ||
        !isAttachedToComposer(file)
      ) {
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
    [resolveText, showToast, localize, detach, textAreaRef, methods, index, isAttachedToComposer],
  );

  return { editing, openEditor, closeEditor, saveEdit, moveInline };
}
