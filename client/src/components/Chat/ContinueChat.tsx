import React from 'react';
import { Button } from '../ui';
import { request } from 'librechat-data-provider';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export default function ContinueChat() {
  const { conversationId } = useParams();
  const conversation = useRecoilValue(store.conversation);
  console.log(conversation);

  const handleClick = () => {
    request.post(`/api/rooms/join/${conversationId}`);
  };

  return (
    <div className="flex w-full justify-center">
      <Button
        className="w-1/2 items-center rounded-full bg-blue-800 hover:bg-blue-500"
        onClick={handleClick}
      >
        Continue Chat
      </Button>
    </div>
  );
}
