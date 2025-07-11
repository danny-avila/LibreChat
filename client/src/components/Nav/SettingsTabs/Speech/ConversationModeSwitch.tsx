import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ConversationModeSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [conversationMode, setConversationMode] = useAtom<boolean>(store.conversationMode);
  const speechToText = useAtomValue(store.speechToText);
  const textToSpeech = useAtomValue(store.textToSpeech);
  const setAutoSendText = useSetAtom(store.autoSendText);
  const setDecibelValue = useSetAtom(store.decibelValue);
  const setAutoTranscribeAudio = useSetAtom(store.autoTranscribeAudio);

  const handleCheckedChange = (value: boolean) => {
    setAutoTranscribeAudio(value);
    setAutoSendText(3);
    setDecibelValue(-45);
    setConversationMode(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <strong>{localize('com_nav_conversation_mode')}</strong>
      </div>
      <div className="flex items-center justify-between">
        <Switch
          id="ConversationMode"
          checked={conversationMode}
          onCheckedChange={handleCheckedChange}
          className="ml-4"
          data-testid="ConversationMode"
          disabled={!textToSpeech || !speechToText}
        />
      </div>
    </div>
  );
}
