import React, { useState, useMemo, memo } from 'react';
import { useRecoilState } from 'recoil';
import type { TConversation, TMessage, TFeedback } from 'librechat-data-provider';
import {
  EditIcon,
  Clipboard,
  CheckMark,
  ContinueIcon,
  RegenerateIcon,
  InfoIcon,
} from '@librechat/client';
import { TooltipAnchor } from '~/components';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { Fork } from '~/components/Conversations';
import MessageAudio from './MessageAudio';
import Feedback from './Feedback';
import { cn } from '~/utils';
import store from '~/store';

type THoverButtons = {
  isEditing: boolean;
  enterEdit: (cancel?: boolean) => void;
  copyToClipboard: (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => void;
  conversation: TConversation | null;
  isSubmitting: boolean;
  message: TMessage;
  regenerate: () => void;
  handleContinue: (e: React.MouseEvent<HTMLButtonElement>) => void;
  latestMessage: TMessage | null;
  isLast: boolean;
  index: number;
  handleFeedback: ({ feedback }: { feedback: TFeedback | undefined }) => void;
};

type HoverButtonProps = {
  id?: string;
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isVisible?: boolean;
  isDisabled?: boolean;
  isLast?: boolean;
  className?: string;
  buttonStyle?: string;
};

const extractMessageContent = (message: TMessage): string => {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if ('text' in part) {
          return part.text || '';
        }
        if ('think' in part) {
          const think = part.think;
          if (typeof think === 'string') {
            return think;
          }
          return think && 'text' in think ? think.text || '' : '';
        }
        return '';
      })
      .join('');
  }

  return message.text || '';
};

/**
 * Formats model information for display in tooltip and clipboard copy.
 * Extracts and formats relevant metadata from message and conversation objects.
 * 
 * @param {TMessage} message - The message object containing model metadata
 * @param {TConversation | null} conversation - The conversation context containing additional model info
 * @returns {string} Formatted multi-line string with model details
 * 
 * @example
 * // Returns formatted string like:
 * // "Model: gpt-4-turbo
 * //  Provider: openai (azure)
 * //  Timestamp: Jan 15, 2024, 10:30:45 AM
 * //  Message ID: msg_abc123...
 * //  Finish: stop"
 */
const formatModelInfo = (message: TMessage, conversation: TConversation | null): string => {
  // Extract model information with fallbacks
  const model = message.model || conversation?.model || 'Unknown Model';
  const modelLabel = conversation?.modelLabel || model;
  const endpoint = conversation?.endpoint || 'Unknown Provider';
  const endpointType = conversation?.endpointType;

  // Format the timestamp with locale-aware formatting
  const timestamp = message.createdAt
    ? new Date(message.createdAt).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Unknown Time';

  // Build optional additional information fields
  const messageId = message.messageId ? `\nMessage ID: ${message.messageId.slice(0, 8)}...` : '';
  const finishReason = message.finish_reason ? `\nFinish: ${message.finish_reason}` : '';
  const error = message.error ? '\nStatus: ⚠️ Error' : '';
  
  // Combine endpoint and endpointType for complete provider info
  const providerInfo = endpointType && endpointType !== endpoint 
    ? `${endpoint} (${endpointType})` 
    : endpoint;

  // Construct final formatted string
  return `Model: ${modelLabel || model}\nProvider: ${providerInfo}\nTimestamp: ${timestamp}${messageId}${finishReason}${error}`;
};

const HoverButton = memo(
  ({
    id,
    onClick,
    title,
    icon,
    isActive = false,
    isVisible = true,
    isDisabled = false,
    isLast = false,
    className = '',
  }: HoverButtonProps) => {
    const buttonStyle = cn(
      'hover-button rounded-lg p-1.5 text-text-secondary-alt transition-colors duration-200',
      'hover:text-text-primary hover:bg-surface-hover',
      'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
      !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
      !isVisible && 'opacity-0',
      'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
      isActive && isVisible && 'active text-text-primary bg-surface-hover',
      className,
    );

    return (
      <button
        id={id}
        className={buttonStyle}
        onClick={onClick}
        type="button"
        title={title}
        disabled={isDisabled}
      >
        {icon}
      </button>
    );
  },
);

HoverButton.displayName = 'HoverButton';

const HoverButtons = ({
  index,
  isEditing,
  enterEdit,
  copyToClipboard,
  conversation,
  isSubmitting,
  message,
  regenerate,
  handleContinue,
  latestMessage,
  isLast,
  handleFeedback,
}: THoverButtons) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
  // Track copy state for model info button visual feedback
  const [isModelInfoCopied, setIsModelInfoCopied] = useState(false);
  const [TextToSpeech] = useRecoilState<boolean>(store.textToSpeech);

  const endpoint = useMemo(() => {
    if (!conversation) {
      return '';
    }
    return conversation.endpointType ?? conversation.endpoint;
  }, [conversation]);

  const generationCapabilities = useGenerationsByLatest({
    isEditing,
    isSubmitting,
    error: message.error,
    endpoint: endpoint ?? '',
    messageId: message.messageId,
    searchResult: message.searchResult,
    finish_reason: message.finish_reason,
    isCreatedByUser: message.isCreatedByUser,
    latestMessageId: latestMessage?.messageId,
  });

  const {
    hideEditButton,
    regenerateEnabled,
    continueSupported,
    forkingSupported,
    isEditableEndpoint,
  } = generationCapabilities;

  if (!conversation) {
    return null;
  }

  const { isCreatedByUser, error } = message;

  if (error === true) {
    return (
      <div className="visible flex justify-center self-end lg:justify-start">
        {regenerateEnabled && (
          <HoverButton
            onClick={regenerate}
            title={localize('com_ui_regenerate')}
            icon={<RegenerateIcon size="19" />}
            isLast={isLast}
          />
        )}
      </div>
    );
  }

  const onEdit = () => {
    if (isEditing) {
      return enterEdit(true);
    }
    enterEdit();
  };

  const handleCopy = () => copyToClipboard(setIsCopied);

  /**
   * Memoized model information string to prevent unnecessary recalculations.
   * Only recomputes when message or conversation objects change.
   */
  const modelInfo = useMemo(
    () => formatModelInfo(message, conversation),
    [message, conversation]
  );

  /**
   * Handles copying model information to clipboard when info button is clicked.
   * Shows visual feedback (checkmark) for 2 seconds after successful copy.
   */
  const handleCopyModelInfo = () => {
    navigator.clipboard.writeText(modelInfo).then(() => {
      setIsModelInfoCopied(true);
      // Reset visual feedback after 2 seconds
      setTimeout(() => setIsModelInfoCopied(false), 2000);
    });
  };

  return (
    <div className="group visible flex justify-center gap-0.5 self-end focus-within:outline-none lg:justify-start">
      {/* Text to Speech */}
      {TextToSpeech && (
        <MessageAudio
          index={index}
          isLast={isLast}
          messageId={message.messageId}
          content={extractMessageContent(message)}
          renderButton={(props) => (
            <HoverButton
              onClick={props.onClick}
              title={props.title}
              icon={props.icon}
              isActive={props.isActive}
              isLast={isLast}
            />
          )}
        />
      )}

      {/* Copy Button */}
      <HoverButton
        onClick={handleCopy}
        title={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
        icon={isCopied ? <CheckMark className="h-[18px] w-[18px]" /> : <Clipboard size="19" />}
        isLast={isLast}
        className={`ml-0 flex items-center gap-1.5 text-xs ${isSubmitting && isCreatedByUser ? 'md:opacity-0 md:group-hover:opacity-100' : ''}`}
      />

      {/* Edit Button */}
      {isEditableEndpoint && (
        <HoverButton
          id={`edit-${message.messageId}`}
          onClick={onEdit}
          title={localize('com_ui_edit')}
          icon={<EditIcon size="19" />}
          isActive={isEditing}
          isVisible={!hideEditButton}
          isDisabled={hideEditButton}
          isLast={isLast}
          className={isCreatedByUser ? '' : 'active'}
        />
      )}

      {/* Fork Button */}
      <Fork
        messageId={message.messageId}
        conversationId={conversation.conversationId}
        forkingSupported={forkingSupported}
        latestMessageId={latestMessage?.messageId}
        isLast={isLast}
      />

      {/* Feedback Buttons */}
      {!isCreatedByUser && (
        <Feedback handleFeedback={handleFeedback} feedback={message.feedback} isLast={isLast} />
      )}

      {/* Regenerate Button */}
      {regenerateEnabled && (
        <HoverButton
          onClick={regenerate}
          title={localize('com_ui_regenerate')}
          icon={<RegenerateIcon size="19" />}
          isLast={isLast}
          className="active"
        />
      )}

      {/* Model Info Button */}
      {!isCreatedByUser && (
        <TooltipAnchor
          description={
            isModelInfoCopied 
              ? '✓ Copied to clipboard!' 
              : modelInfo + '\n\nClick to copy'
          }
          side="top"
          className="inline-flex"
          role="tooltip"
        >
          <HoverButton
            id={`model-info-${message.messageId}`}
            onClick={handleCopyModelInfo}
            title={localize('com_ui_model_info') || 'Model Information'}
            icon={
              isModelInfoCopied ? (
                <CheckMark className="h-[18px] w-[18px]" />
              ) : (
                <InfoIcon size="19" aria-hidden="true" />
              )
            }
            isLast={isLast}
            className="active"
          />
        </TooltipAnchor>
      )}

      {/* Continue Button */}
      {continueSupported && (
        <HoverButton
          onClick={(e) => e && handleContinue(e)}
          title={localize('com_ui_continue')}
          icon={<ContinueIcon className="w-19 h-19 -rotate-180" />}
          isLast={isLast}
          className="active"
        />
      )}
    </div>
  );
};

export default memo(HoverButtons);
