import React from 'react';
import { Button } from '../ui';
import { TConversation, request } from 'librechat-data-provider';
import { useParams } from 'react-router-dom';
import { SetterOrUpdater } from 'recoil';

interface Props {
  conversation: TConversation | null;
  setConversation: SetterOrUpdater<TConversation | null>;
}

export default function ContinueChat({ conversation, setConversation }: Props) {
  const { conversationId } = useParams();
  console.log(conversation);

  const handleClick = () => {
    request
      .post(`/api/rooms/join/${conversationId}`)
      .then((responseData) => {
        setConversation(responseData);
      })
      .catch((error) => console.error(error));
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
