import { useCallback, useEffect, useMemo } from 'react';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import { PermissionTypes, Permissions, isAssistantsEndpoint } from 'librechat-data-provider';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import store from '~/store';

/** Event keys that shouldn't trigger a command */
const invalidKeys = {
  Escape: true,
  Backspace: true,
  Enter: true,
  ArrowUp: true,
  ArrowLeft: true,
  ArrowRight: true,
  ArrowDown: true,
  Home: true,
  End: true,
  Delete: true,
};

/**
 * Determines if a command popover should trigger.
 * Uses `startPos === 1` for normal typing speed (cursor right after the command char)
 * and a short text-length fallback for fast typists whose keyup fires after the cursor
 * has already moved past position 1. The length cap prevents false triggers from
 * pasted content that happens to start with a command character.
 */
const MAX_COMMAND_TRIGGER_LENGTH = 5;
const shouldTriggerCommand = (
  textAreaRef: React.RefObject<HTMLTextAreaElement>,
  commandChar: string,
) => {
  const text = textAreaRef.current?.value;
  if (typeof text !== 'string' || text.length === 0 || text[0] !== commandChar) {
    return false;
  }

  const startPos = textAreaRef.current?.selectionStart;
  if (typeof startPos !== 'number') {
    return false;
  }

  return startPos === 1 || (startPos === text.length && text.length <= MAX_COMMAND_TRIGGER_LENGTH);
};

/**
 * Custom hook for handling key up events with command triggers.
 */
const useHandleKeyUp = ({
  index,
  textAreaRef,
}: {
  index: number;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) => {
  const hasPromptsAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });
  const hasMultiConvoAccess = useHasAccess({
    permissionType: PermissionTypes.MULTI_CONVO,
    permission: Permissions.USE,
  });
  const latestMessage = useRecoilValue(store.latestMessageFamily(index));
  const endpoint = useRecoilValue(store.effectiveEndpointByIndex(index));
  const setShowMentionPopover = useSetRecoilState(store.showMentionPopoverFamily(index));
  const setShowPlusPopover = useSetRecoilState(store.showPlusPopoverFamily(index));
  const setShowPromptsPopover = useSetRecoilState(store.showPromptsPopoverFamily(index));

  const atCommandEnabled = useRecoilValue(store.atCommand);
  const plusCommandEnabled = useRecoilValue(store.plusCommand);
  const slashCommandEnabled = useRecoilValue(store.slashCommand);

  useEffect(() => {
    if (isAssistantsEndpoint(endpoint)) {
      setShowPlusPopover(false);
    }
  }, [endpoint, setShowPlusPopover]);

  const handleAtCommand = useCallback(() => {
    if (atCommandEnabled && shouldTriggerCommand(textAreaRef, '@')) {
      setShowMentionPopover(true);
    }
  }, [textAreaRef, setShowMentionPopover, atCommandEnabled]);

  const handlePlusCommand = useCallback(() => {
    if (!hasMultiConvoAccess || !plusCommandEnabled || isAssistantsEndpoint(endpoint)) {
      return;
    }
    if (shouldTriggerCommand(textAreaRef, '+')) {
      setShowPlusPopover(true);
    }
  }, [textAreaRef, setShowPlusPopover, plusCommandEnabled, hasMultiConvoAccess, endpoint]);

  const handlePromptsCommand = useCallback(() => {
    if (!hasPromptsAccess || !slashCommandEnabled) {
      return;
    }
    if (shouldTriggerCommand(textAreaRef, '/')) {
      setShowPromptsPopover(true);
    }
  }, [textAreaRef, hasPromptsAccess, setShowPromptsPopover, slashCommandEnabled]);

  const commandHandlers = useMemo(
    () => ({
      '@': handleAtCommand,
      '+': handlePlusCommand,
      '/': handlePromptsCommand,
    }),
    [handleAtCommand, handlePlusCommand, handlePromptsCommand],
  );

  const handleUpArrow = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!latestMessage) {
        return;
      }

      const element = document.getElementById(`edit-${latestMessage.parentMessageId}`);
      if (!element) {
        return;
      }
      event.preventDefault();
      element.click();
    },
    [latestMessage],
  );

  /**
   * Main key up handler.
   */
  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const text = textAreaRef.current?.value;
      if (event.key === 'ArrowUp' && text?.length === 0) {
        handleUpArrow(event);
        return;
      }
      if (typeof text !== 'string' || text.length === 0) {
        return;
      }

      if (invalidKeys[event.key as keyof typeof invalidKeys]) {
        return;
      }

      const firstChar = text[0];
      const handler = commandHandlers[firstChar as keyof typeof commandHandlers];

      if (typeof handler === 'function') {
        handler();
      }
    },
    [textAreaRef, commandHandlers, handleUpArrow],
  );

  return handleKeyUp;
};

export default useHandleKeyUp;
