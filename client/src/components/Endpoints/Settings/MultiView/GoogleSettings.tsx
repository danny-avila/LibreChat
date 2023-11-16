import Settings from '../Google';
import Examples from '../Examples';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';

export default function GoogleView({ conversation, models, isPreset = false }) {
  const { optionSettings } = useChatContext();
  const { setOption, setExample, addExample, removeExample } = useSetIndexOptions(
    isPreset ? conversation : null,
  );
  if (!conversation) {
    return null;
  }

  const { examples } = conversation;
  const { showExamples, isCodeChat } = optionSettings;
  return showExamples && !isCodeChat ? (
    <Examples
      examples={examples ?? []}
      setExample={setExample}
      addExample={addExample}
      removeExample={removeExample}
    />
  ) : (
    <Settings conversation={conversation} setOption={setOption} models={models} />
  );
}
