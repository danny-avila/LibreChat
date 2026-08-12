import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, TextareaAutosize } from '@librechat/client';
import { ContentTypes } from 'librechat-data-provider';
import { useUpdateMessageContentMutation } from 'librechat-data-provider/react-query';
import type { ReactNode } from 'react';
import type { TMessageContentParts } from 'librechat-data-provider';
import { useMessagesConversation, useMessagesOperations } from '~/Providers';
import { useGetAddedConvo } from '~/hooks/Chat';
import { useLocalize } from '~/hooks';
import { splitMarkdownIntoBlocks } from './splitMarkdown';

type EditableType = ContentTypes.TEXT | ContentTypes.THINK;

type EditablePart = {
  index: number;
  localIndex: number;
  type: EditableType;
  original: string;
};

type EditContentPartsProps = {
  content: Array<TMessageContentParts | undefined>;
  contentIndexOffset?: number;
  messageId: string;
  isSubmitting: boolean;
  enterEdit: (cancel?: boolean) => void | null | undefined;
  siblingIdx: number | null;
  setSiblingIdx: (value: number) => void;
  renderReadOnlyPart: (part: TMessageContentParts, index: number, isLastPart: boolean) => ReactNode;
};

const getPartText = (part: TMessageContentParts): string | undefined => {
  if (part.type === ContentTypes.TEXT) {
    return typeof part.text === 'string' ? part.text : part.text?.value;
  }
  if (part.type === ContentTypes.THINK) {
    return typeof part.think === 'string' ? part.think : part.think?.value;
  }
  return undefined;
};

const containsArtifact = (text: string): boolean => {
  if (!text.includes('artifact')) {
    return false;
  }
  try {
    return splitMarkdownIntoBlocks(text).some((block) => block.artifactCount > 0);
  } catch {
    return false;
  }
};

export default function EditContentParts({
  content,
  contentIndexOffset = 0,
  messageId,
  isSubmitting,
  enterEdit,
  siblingIdx,
  setSiblingIdx,
  renderReadOnlyPart,
}: EditContentPartsProps) {
  const localize = useLocalize();
  const { conversation } = useMessagesConversation();
  const { ask, getMessages, setMessages } = useMessagesOperations();
  const getAddedConvo = useGetAddedConvo();
  const firstEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const updateMessageContentMutation = useUpdateMessageContentMutation(
    conversation?.conversationId ?? '',
  );

  const editableParts = useMemo<EditablePart[]>(() => {
    const result: EditablePart[] = [];
    content.forEach((part, localIndex) => {
      if (!part || (part.type !== ContentTypes.TEXT && part.type !== ContentTypes.THINK)) {
        return;
      }
      if (part.type === ContentTypes.TEXT && part.tool_call_ids != null) {
        return;
      }
      const original = getPartText(part);
      if (original == null || containsArtifact(original)) {
        return;
      }
      result.push({
        index: localIndex + contentIndexOffset,
        localIndex,
        type: part.type,
        original,
      });
    });
    return result;
  }, [content, contentIndexOffset]);

  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(editableParts.map((part) => [part.index, part.original])),
  );

  const editableByLocalIndex = useMemo(
    () => new Map(editableParts.map((part) => [part.localIndex, part])),
    [editableParts],
  );
  const changedParts = useMemo(
    () => editableParts.filter((part) => drafts[part.index] !== part.original),
    [drafts, editableParts],
  );
  const editedMessage = getMessages()?.find((item) => item.messageId === messageId);
  const rerunRequiresSave = editedMessage?.isCreatedByUser !== true && changedParts.length > 1;
  const isBusy = isSubmitting || isSaving;

  useEffect(() => {
    const editor = firstEditorRef.current;
    if (!editor) {
      return;
    }
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }, []);

  const updateLocalMessages = useCallback(() => {
    const messages = getMessages();
    if (!messages) {
      return;
    }
    const changedByLocalIndex = new Map(
      changedParts.map((part) => [part.localIndex, { type: part.type, text: drafts[part.index] }]),
    );
    setMessages(
      messages.map((currentMessage) => {
        if (currentMessage.messageId !== messageId || !Array.isArray(currentMessage.content)) {
          return currentMessage;
        }
        return {
          ...currentMessage,
          content: currentMessage.content.map((part, localIndex) => {
            const change = changedByLocalIndex.get(localIndex);
            if (!part || !change || part.type !== change.type) {
              return part;
            }
            return { ...part, [change.type]: change.text } as TMessageContentParts;
          }),
        };
      }),
    );
  }, [changedParts, drafts, getMessages, messageId, setMessages]);

  const saveChanges = useCallback(async () => {
    if (changedParts.length === 0 || isBusy) {
      return;
    }
    setIsSaving(true);
    setSaveError(false);
    try {
      /** Each endpoint call replaces the full content array. Keep writes ordered so a
       *  later edit reads the content produced by the previous one instead of racing it. */
      for (const part of changedParts) {
        await updateMessageContentMutation.mutateAsync({
          index: part.index,
          conversationId: conversation?.conversationId ?? '',
          text: drafts[part.index],
          messageId,
        });
      }
      updateLocalMessages();
      enterEdit(true);
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }, [
    changedParts,
    conversation?.conversationId,
    drafts,
    enterEdit,
    isBusy,
    messageId,
    updateLocalMessages,
    updateMessageContentMutation,
  ]);

  const updateAndRerun = useCallback(() => {
    const firstChange = changedParts[0];
    if (!firstChange || !editedMessage || rerunRequiresSave || isBusy) {
      return;
    }
    const messages = getMessages();

    if (editedMessage.isCreatedByUser === true) {
      const userText = editableParts
        .filter((part) => part.type === ContentTypes.TEXT)
        .map((part) => drafts[part.index])
        .join('\n');
      ask(
        {
          text: userText,
          parentMessageId: editedMessage.parentMessageId,
          conversationId: editedMessage.conversationId,
        },
        {
          overrideFiles: editedMessage.files,
          overrideManualSkills: editedMessage.manualSkills,
          overrideQuotes: editedMessage.quotes,
          addedConvo: getAddedConvo() || undefined,
        },
      );
    } else {
      const parentMessage = messages?.find(
        (item) => item.messageId === editedMessage.parentMessageId,
      );
      if (!parentMessage) {
        return;
      }
      const editedContent =
        firstChange.type === ContentTypes.THINK
          ? {
              index: firstChange.index,
              type: ContentTypes.THINK as const,
              [ContentTypes.THINK]: drafts[firstChange.index],
            }
          : {
              index: firstChange.index,
              type: ContentTypes.TEXT as const,
              [ContentTypes.TEXT]: drafts[firstChange.index],
            };
      ask(
        { ...parentMessage },
        {
          editedContent,
          editedMessageId: messageId,
          isRegenerate: true,
          isEdited: true,
          overrideManualSkills: parentMessage.manualSkills,
          overrideQuotes: parentMessage.quotes,
          addedConvo: getAddedConvo() || undefined,
        },
      );
    }

    setSiblingIdx((siblingIdx ?? 0) - 1);
    enterEdit(true);
  }, [
    ask,
    changedParts,
    drafts,
    editedMessage,
    editableParts,
    enterEdit,
    getAddedConvo,
    getMessages,
    isBusy,
    messageId,
    rerunRequiresSave,
    setSiblingIdx,
    siblingIdx,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        enterEdit(true);
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        updateAndRerun();
        return;
      }
      if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveChanges();
      }
    },
    [enterEdit, saveChanges, updateAndRerun],
  );

  return (
    <section
      aria-label={localize('com_ui_edit_message')}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-border-light bg-surface-secondary p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {localize('com_ui_edit_message')}
        </h3>
        <span className="text-xs text-text-secondary" aria-live="polite">
          {changedParts.length > 0 ? localize('com_ui_unsaved_changes') : ''}
        </span>
      </header>

      {saveError && <Alert variant="error">{localize('com_ui_save_message_error')}</Alert>}

      <div className="flex min-w-0 flex-col gap-3">
        {content.map((part, localIndex) => {
          if (!part) {
            return null;
          }
          const editablePart = editableByLocalIndex.get(localIndex);
          const absoluteIndex = localIndex + contentIndexOffset;
          if (!editablePart) {
            return (
              <div key={`read-only-${messageId}-${absoluteIndex}`} className="min-w-0">
                {renderReadOnlyPart(part, absoluteIndex, localIndex === content.length - 1)}
              </div>
            );
          }
          const label =
            editablePart.type === ContentTypes.THINK
              ? localize('com_ui_thoughts')
              : localize('com_ui_response');
          return (
            <label
              key={`editor-${messageId}-${absoluteIndex}`}
              className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-text-secondary"
            >
              {label}
              <TextareaAutosize
                ref={editablePart === editableParts[0] ? firstEditorRef : undefined}
                value={drafts[absoluteIndex]}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [absoluteIndex]: event.target.value,
                  }))
                }
                onKeyDown={handleKeyDown}
                aria-label={`${localize('com_ui_editable_message')}: ${label}`}
                aria-keyshortcuts="Control+Enter Meta+Enter Control+S Meta+S Escape"
                disabled={isBusy}
                minRows={3}
                className="max-h-[65vh] min-h-24 w-full resize-y rounded-lg border border-border-medium bg-surface-tertiary-alt px-3 py-2 text-sm font-normal text-text-primary focus-visible:outline-none disabled:opacity-50 md:max-h-[75vh]"
              />
            </label>
          );
        })}
      </div>

      {rerunRequiresSave && (
        <p className="text-xs text-text-secondary" aria-live="polite">
          {localize('com_ui_save_before_rerun')}
        </p>
      )}

      <footer className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => enterEdit(true)} disabled={isSaving}>
          {localize('com_ui_cancel')}
        </Button>
        <Button
          variant="outline"
          onClick={() => void saveChanges()}
          disabled={changedParts.length === 0 || isBusy}
        >
          {isSaving ? localize('com_ui_saving') : localize('com_ui_save')}
        </Button>
        <Button
          variant="submit"
          onClick={updateAndRerun}
          disabled={changedParts.length === 0 || rerunRequiresSave || isBusy}
        >
          {localize('com_ui_update_rerun')}
        </Button>
      </footer>
    </section>
  );
}
