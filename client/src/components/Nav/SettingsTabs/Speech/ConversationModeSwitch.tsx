import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ConversationModeSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [conversationMode, setConversationMode] = useRecoilState<boolean>(store.conversationMode);
  const [advancedMode] = useRecoilState<boolean>(store.advancedMode);
  const [textToSpeech] = useRecoilState<boolean>(store.TextToSpeech);
  const [, setAutoSendText] = useRecoilState<boolean>(store.autoSendText);
  const [, setDecibelValue] = useRecoilState(store.decibelValue);
  const [, setAutoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio);

  const handleCheckedChange = (value: boolean) => {
    if (!advancedMode) {
      setAutoTranscribeAudio(value);
      setAutoSendText(value);
      setDecibelValue(-45);
    }
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
          disabled={!textToSpeech}
        />
      </div>
    </div>
  );
}
