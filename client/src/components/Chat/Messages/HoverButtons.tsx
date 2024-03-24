import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import {
  Clipboard,
  CheckMark,
  EditIcon,
  RegenerateIcon,
  ContinueIcon,
  VolumeIcon,
  VolumeMuteIcon,
  Spinner,
} from '~/components/svg';
import {
  useGenerationsByLatest,
  useLocalize,
  useTextToSpeech,
  useTextToSpeechExternal,
} from '~/hooks';
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
};

export default function HoverButtons({
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
}: THoverButtons) {
  const localize = useLocalize();
  const { endpoint: _endpoint, endpointType } = conversation ?? {};
  const endpoint = endpointType ?? _endpoint;
  const [isCopied, setIsCopied] = useState(false);
  const isMouseDownRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const { data: startupConfig } = useGetStartupConfig();
  const useExternalTextToSpeech = startupConfig?.speechToTextExternal;

  const {
    generateSpeechLocal: generateSpeechLocal,
    cancelSpeechLocal: cancelSpeechLocal,
    isSpeaking: isSpeakingLocal,
  } = useTextToSpeech();

  const {
    generateSpeechExternal: generateSpeechExternal,
    cancelSpeech: cancelSpeechExternal,
    isLoading: isLoading,
    isSpeaking: isSpeakingExternal,
  } = useTextToSpeechExternal();

  const generateSpeech = useExternalTextToSpeech ? generateSpeechExternal : generateSpeechLocal;
  const cancelSpeech = useExternalTextToSpeech ? cancelSpeechExternal : cancelSpeechLocal;
  const isSpeaking = useExternalTextToSpeech ? isSpeakingExternal : isSpeakingLocal;

  const [TextToSpeech] = useRecoilState<boolean>(store.TextToSpeech);

  const { hideEditButton, regenerateEnabled, continueSupported } = useGenerationsByLatest({
    isEditing,
    isSubmitting,
    message,
    endpoint: endpoint ?? '',
    latestMessage,
  });
  if (!conversation) {
    return null;
  }

  const { isCreatedByUser } = message;

  const onEdit = () => {
    if (isEditing) {
      return enterEdit(true);
    }
    enterEdit();
  };

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    timerRef.current = window.setTimeout(() => {
      if (isMouseDownRef.current) {
        generateSpeech(message?.text ?? '', true);
      }
    }, 1000);
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      cancelSpeech();
    } else {
      generateSpeech(message?.text ?? '', false);
    }
  };

  return (
    <div className="visible mt-0 flex justify-center gap-1 self-end text-gray-400 lg:justify-start">
      {TextToSpeech && (
        <button
          className="hover-button rounded-md p-1 pl-0 text-gray-400 hover:text-gray-950 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={toggleSpeech}
          type="button"
          title={isSpeaking ? localize('com_ui_stop_speaking') : localize('com_ui_speak')}
        >
          {isLoading ? <Spinner /> : isSpeaking ? <VolumeMuteIcon /> : <VolumeIcon />}
        </button>
      )}
      {endpoint !== EModelEndpoint.assistants && (
        <button
          className={cn(
            'hover-button rounded-md p-1 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
            isCreatedByUser ? '' : 'active',
            hideEditButton ? 'opacity-0' : '',
            isEditing ? 'active bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : '',
            !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
          )}
          onClick={onEdit}
          type="button"
          title={localize('com_ui_edit')}
          disabled={hideEditButton}
        >
          <EditIcon />
        </button>
      )}
      <button
        className={cn(
          'ml-0 flex items-center gap-1.5 rounded-md p-1 text-xs hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
          isSubmitting && isCreatedByUser ? 'md:opacity-0 md:group-hover:opacity-100' : '',
          !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
        )}
        onClick={() => copyToClipboard(setIsCopied)}
        type="button"
        title={
          isCopied ? localize('com_ui_copied_to_clipboard') : localize('com_ui_copy_to_clipboard')
        }
      >
        {isCopied ? <CheckMark /> : <Clipboard />}
      </button>
      {regenerateEnabled ? (
        <button
          className={cn(
            'hover-button active rounded-md p-1 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible md:group-[.final-completion]:visible',
            !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
          )}
          onClick={regenerate}
          type="button"
          title={localize('com_ui_regenerate')}
        >
          <RegenerateIcon className="hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
      {continueSupported ? (
        <button
          className={cn(
            'hover-button active rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible ',
            !isLast ? 'md:opacity-0 md:group-hover:opacity-100' : '',
          )}
          onClick={handleContinue}
          type="button"
          title={localize('com_ui_continue')}
        >
          <ContinueIcon className="h-4 w-4 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
    </div>
  );
}
