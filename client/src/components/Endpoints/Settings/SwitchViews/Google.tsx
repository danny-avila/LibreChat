import Settings from '../Google';
import Examples from '../Examples';
import { useRecoilState } from 'recoil';
import { GoogleViewProps, SetExample, TConversation } from 'librechat-data-provider';
import store from '~/store';

export default function GoogleView({ showExamples, isCodeChat, setOption }: GoogleViewProps) {
  const [conversation, setConversation] = useRecoilState(store.conversation);

  if (!conversation) {
    return null;
  }

  const { examples } = conversation;
  const setExample: SetExample = (i, type, newValue = null) => {
    let update = {};
    let current = conversation?.examples?.slice() || [];
    let currentExample = { ...current[i] } || {};
    currentExample[type] = { content: newValue };
    current[i] = currentExample;
    update['examples'] = current;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const addExample: () => void = () => {
    let update = {};
    let current = conversation?.examples?.slice() || [];
    current.push({ input: { content: '' }, output: { content: '' } });
    update['examples'] = current;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const removeExample: () => void = () => {
    let update = {};
    let current = conversation?.examples?.slice() || [];
    if (current.length <= 1) {
      update['examples'] = [{ input: { content: '' }, output: { content: '' } }];
      setConversation(
        (prevState) =>
          ({
            ...prevState,
            ...update,
          } as TConversation),
      );
      return;
    }
    current.pop();
    update['examples'] = current;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

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
