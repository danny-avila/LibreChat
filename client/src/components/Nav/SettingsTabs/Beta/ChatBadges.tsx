import { useSetRecoilState } from 'recoil';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ChatBadges() {
  const setIsEditing = useSetRecoilState<boolean>(store.isEditingBadges);
  const localize = useLocalize();

  const handleEditChatBadges = () => {
    setIsEditing(true);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_edit_chat_badges')}</div>
      <Button variant="outline" onClick={handleEditChatBadges}>
        {localize('com_ui_edit')}
      </Button>
    </div>
  );
}
