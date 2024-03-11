import { useState } from 'react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { Clipboard, CheckMark, EditIcon, RegenerateIcon, ContinueIcon } from '~/components/svg';
import { useGenerationsByLatest, useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { SpeakerLoudIcon, StopIcon } from '@radix-ui/react-icons';
import { useGlobalAudioPlayer } from 'react-use-audio-player';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { useAuthContext } from '~/hooks/AuthContext';
import { Loader } from 'lucide-react';
import store from '~/store';
import { useRecoilState } from 'recoil';

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
}: THoverButtons) {
  const [audioId, setAudioId] = useRecoilState(store.audioId);
  const { data: startupConfig } = useGetStartupConfig();
  const { token } = useAuthContext();
  const { load, src, playing, stopped, isReady, duration, stop, play } = useGlobalAudioPlayer();
  const localize = useLocalize();
  const { endpoint: _endpoint, endpointType } = conversation ?? {};
  const endpoint = endpointType ?? _endpoint;
  const [isCopied, setIsCopied] = useState(false);
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

  const loadAudio = () => {
    if (!startupConfig) {return;}
    if (src && src.includes(message.messageId)) {
      return play();
    }
    setAudioId(message.messageId);
    load(
      `${startupConfig.serverDomain || ''}/api/voice/tts?messageId=${
        message.messageId
      }&token=${token}`,
      { autoplay: true, format: 'mp3', html5: true },
    );
  };

  return (
    <div className="visible mt-0 flex justify-center gap-1 self-end text-gray-400 lg:justify-start">
      <button
        className={cn(
          'hover-button rounded-md p-1 pl-0 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
          isCreatedByUser ? '' : 'active',
          hideEditButton ? 'opacity-0' : '',
          isEditing ? 'active bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : '',
        )}
        type="button"
        // title={localize('com_ui_speak')}
        disabled={hideEditButton}
      >
        {playing && src?.includes(message.messageId) ? (
          <StopIcon onClick={stop} />
        ) : audioId === message.messageId && !src?.includes(message.messageId) ? (
          <Loader className="animate-spin" size={16} />
        ) : (
          <SpeakerLoudIcon onClick={loadAudio} />
        )}
      </button>
      <button
        className={cn(
          'hover-button rounded-md p-1 pl-0 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
          isCreatedByUser ? '' : 'active',
          hideEditButton ? 'opacity-0' : '',
          isEditing ? 'active bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' : '',
        )}
        onClick={onEdit}
        type="button"
        title={localize('com_ui_edit')}
        disabled={hideEditButton}
      >
        <EditIcon />
      </button>
      <button
        className={cn(
          'ml-0 flex items-center gap-1.5 rounded-md p-1 pl-0 text-xs hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible',
          isSubmitting && isCreatedByUser ? 'md:opacity-0 md:group-hover:opacity-100' : '',
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
          className="hover-button active rounded-md p-1 pl-0 text-gray-400 hover:text-gray-900 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible md:group-[.final-completion]:visible"
          onClick={regenerate}
          type="button"
          title={localize('com_ui_regenerate')}
        >
          <RegenerateIcon className="hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      ) : null}
      {continueSupported ? (
        <button
          className="hover-button active rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible "
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
