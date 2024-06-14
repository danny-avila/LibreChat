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
  const [advancedMode, setAdvancedMode] = useRecoilState<boolean>(store.advancedMode);
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
        <label
          className="flex h-auto cursor-pointer items-center rounded border border-gray-500/70 bg-transparent px-2 py-1 text-xs font-medium font-normal transition-colors hover:border-gray-500/95 hover:bg-gray-100 hover:text-green-700 dark:bg-transparent dark:text-white dark:hover:bg-gray-600 dark:hover:text-green-500"
          onClick={() => setAdvancedMode(!advancedMode)}
        >
          <span>{advancedMode ? 'Advanced Mode' : 'Simple Mode'}</span>
        </label>
        <div className="w-2" />
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
