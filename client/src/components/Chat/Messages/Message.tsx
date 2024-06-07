import { useRecoilState } from 'recoil';
import store from '~/store';
import { TMessageProps } from '~/common';
// eslint-disable-next-line import/no-cycle
import MessageOld from './Message/MessageOld';
// eslint-disable-next-line import/no-cycle
import MessageNew from './Message/MessageNew';

function Message(props: TMessageProps) {
  const [messagesUI, setMessagesUI] = useRecoilState<boolean>(store.messagesUI);

  if (messagesUI) {
    return <MessageNew {...props} />;
  } else {
    return <MessageOld {...props} />;
  }
}

export default Message;
