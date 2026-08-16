import { useRecoilValue } from 'recoil';
import ToggleSwitch from '../ToggleSwitch';
import { setDocumentTitle } from '~/utils';
import store from '~/store';

export default function ChatTitleInTab() {
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const handleCheckedChange = (value: boolean) => {
    setDocumentTitle(conversation?.title, value);
  };

  return (
    <ToggleSwitch
      stateAtom={store.chatTitleInTab}
      localizationKey="com_nav_chat_title_in_tab"
      switchId="chatTitleInTab"
      onCheckedChange={handleCheckedChange}
    />
  );
}
