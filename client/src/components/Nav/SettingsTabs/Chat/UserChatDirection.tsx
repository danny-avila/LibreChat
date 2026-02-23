import { useRecoilState } from 'recoil';
import { Dropdown } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function UserChatDirection() {
  const localize = useLocalize();
  const [direction, setDirection] = useRecoilState(store.userChatDirection);

  const handleChange = (val: string) => {
    setDirection(val.toUpperCase());
  };

  const options = [
    { value: 'LTR', label: 'ltr' },
    { value: 'RTL', label: 'rtl' },
  ];

  const labelId = 'user-chat-direction-label';

  return (
    <div className="flex w-full items-center justify-between">
      <div id={labelId}>{localize('com_nav_user_chat_direction')}</div>
      <Dropdown
        value={direction}
        options={options}
        onChange={handleChange}
        testId="user-chat-direction"
        sizeClasses="w-[150px]"
        className="z-50"
        aria-labelledby={labelId}
      />
    </div>
  );
}
