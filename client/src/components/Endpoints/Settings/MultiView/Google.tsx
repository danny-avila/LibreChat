import Settings from '../Google';
import Examples from '../Examples';
import { useSetOptions } from '~/hooks';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export default function GoogleView() {
  const optionSettings = useRecoilValue(store.optionSettings);
  const { setOption, setExample, addExample, removeExample, getConversation } = useSetOptions();

  const conversation = getConversation();
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
    <Settings conversation={conversation} setOption={setOption} />
  );
}
