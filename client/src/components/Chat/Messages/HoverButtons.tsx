import React, { useState, useMemo, memo } from 'react';
import { useRecoilState } from 'recoil';
import type { TConversation, TMessage, TMessageFeedback } from 'librechat-data-provider';
import {
  EditIcon,
  Clipboard,
  CheckMark,
  ContinueIcon,
  RegenerateIcon,
  ThumbUpIcon,
  ThumbDownIcon,
} from '~/components/svg';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { Fork } from '~/components/Conversations';
import MessageAudio from './MessageAudio';
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
  handleFeedback: (rating: 'thumbsUp' | 'thumbsDown', extraPayload?: any) => void;
  rated: TMessageFeedback | undefined;
};

type HoverButtonProps = {
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  icon: React.ReactNode;
  isActive?: boolean;
  isVisible?: boolean;
  isDisabled?: boolean;
  isLast?: boolean;
  className?: string;
};

const HoverButton = memo(
  ({
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
      'hover-button rounded-lg p-1.5',

      'hover:bg-gray-100 hover:text-gray-500',

      'dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200',
      'disabled:dark:hover:text-gray-400',

      'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
      !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
      !isVisible && 'opacity-0',

      'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',

      isActive && isVisible && 'active text-gray-700 dark:text-gray-200 bg-gray-100 bg-gray-700',

      className,
    );

    return (
      <button
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
  rated,
}: THoverButtons) => {
  const localize = useLocalize();
  const [isCopied, setIsCopied] = useState(false);
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

  const safeRated: TMessageFeedback = rated || { rating: null };
  const currentRating = message.rating != null ? message.rating : safeRated.rating;
  const disableFeedback = message.rating != null || safeRated.rating != null;

  // If message has an error, only show regenerate button
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

  return (
    <div className="group visible flex justify-center gap-0.5 self-end focus-within:outline-none lg:justify-start">
      {/* Text to Speech */}
      {TextToSpeech && (
        <MessageAudio
          index={index}
          messageId={message.messageId}
          content={extractMessageContent(message)}
          isLast={isLast}
          renderButton={(props) => (
            <HoverButton
              onClick={props.onClick}
              title={props.title}
              icon={props.icon}
              isActive={props.isActive}
              isLast={isLast}
              className={props.className}
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

      {/* Fork Button */}
      <Fork
        isLast={isLast}
        messageId={message.messageId}
        conversationId={conversation.conversationId}
        forkingSupported={forkingSupported}
        latestMessageId={latestMessage?.messageId}
      />

      {/* Feedback Buttons */}
      {!isCreatedByUser && (
        <>
          <HoverButton
            onClick={() => handleFeedback('thumbsUp')}
            title={localize('com_ui_feedback_positive')}
            icon={<ThumbUpIcon size="19" bold={currentRating === 'thumbsUp'} />}
            isDisabled={disableFeedback || currentRating === 'thumbsDown'}
            isVisible={currentRating !== 'thumbsDown'}
            isLast={isLast}
            className="active"
          />

          <HoverButton
            onClick={() => handleFeedback('thumbsDown')}
            title={localize('com_ui_feedback_negative')}
            icon={<ThumbDownIcon size="19" bold={currentRating === 'thumbsDown'} />}
            isDisabled={disableFeedback || currentRating === 'thumbsUp'}
            isVisible={currentRating !== 'thumbsUp'}
            isLast={isLast}
            className="active"
          />
        </>
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
