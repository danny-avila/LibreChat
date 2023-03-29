import React from 'react';
import TrashIcon from '../svg/TrashIcon';
import CrossIcon from '../svg/CrossIcon';
import manualSWR from '~/utils/fetchers';
import { useRecoilValue } from 'recoil';

import store from '~/store';

export default function DeleteButton({ conversationId, renaming, cancelHandler, retainView }) {
  const currentConversation = useRecoilValue(store.conversation) || {};
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const { trigger } = manualSWR(`/api/convos/clear`, 'post', () => {
    if (currentConversation?.conversationId == conversationId) newConversation();
    refreshConversations();
    retainView();
  });

  const clickHandler = () => trigger({ conversationId, source: 'button' });
  const handler = renaming ? cancelHandler : clickHandler;

  return (
    <button
      className="p-1 hover:text-white"
      onClick={handler}
    >
      {renaming ? <CrossIcon /> : <TrashIcon />}
    </button>
  );
}
