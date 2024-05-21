import { useRecoilState } from 'recoil';
import MessageOld from './MessageOld';
import MessageNew from './MessageNew';
import store from '~/store';
import { TMessageProps } from '~/common';

function Message(props: TMessageProps) {
  const [messagesUI,] = useRecoilState<boolean>(store.messagesUI);

  if (messagesUI) {
    return <MessageNew {...props} />;
  } else {
    return <MessageOld {...props} />;
  }
}

export default Message;
