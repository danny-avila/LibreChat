import { useRecoilState } from 'recoil';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function UserChatDirection() {
  const localize = useLocalize();
  const [direction, setDirection] = useRecoilState(store.userChatDirection);

  const toggleUserChatDirection = () => {
    setDirection((prev) => (prev === 'LTR' ? 'RTL' : 'LTR'));
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <span id="user-chat-direction-label">{localize('com_nav_user_chat_direction')}</span>
      </div>
      <Button
        variant="outline"
        aria-label={localize('com_nav_user_chat_direction_selected', {
          direction:
            direction === 'LTR'
              ? localize('chat_direction_left_to_right')
              : localize('chat_direction_right_to_left'),
        })}
        onClick={toggleUserChatDirection}
        data-testid="userChatDirection"
      >
        {direction.toLowerCase()}
      </Button>
    </div>
  );
}
