import { UseSetOptions, TConversation, SetOption, SetExample } from 'librechat-data-provider';
import { useRecoilState } from 'recoil';
import store from '~/store';

export default function useSetOptions(): UseSetOptions {
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const setOption: SetOption = (param) => (newValue) => {
    const update = {};
    update[param] = newValue;
    setConversation(
      (prevState) =>
        ({
          ...prevState,
          ...update,
        } as TConversation),
    );
  };

  const setExample: SetExample = (i, type, newValue = null) => {
    const update = {};
    const current = conversation?.examples?.slice() || [];
    const currentExample = { ...current[i] } || {};
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
    const update = {};
    const current = conversation?.examples?.slice() || [];
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
    const update = {};
    const current = conversation?.examples?.slice() || [];
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

  const getConversation: () => TConversation | null = () => conversation;

  return {
    setOption,
    setExample,
    addExample,
    removeExample,
    getConversation,
  };
}
