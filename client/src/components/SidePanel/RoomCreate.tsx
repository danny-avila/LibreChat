import { request } from 'librechat-data-provider';
import React, { useState } from 'react';
import { Checkbox, Input } from '../ui';
import { useChatContext } from '~/Providers';
import { useNavigate } from 'react-router-dom';

interface RoomState {
  title: string;
  isPrivate: boolean;
  password: string;
}

export default function RoomCreate() {
  const navigate = useNavigate();
  const initialRoomState: RoomState = {
    title: '',
    isPrivate: false,
    password: '',
  };
  const [room, setRoom] = useState<RoomState>(initialRoomState);

  const { conversation } = useChatContext();

  const handleSubmit = () => {
    request
      .post('/api/rooms', { ...conversation, ...room, isRoom: true })
      .then((res) => {
        navigate(`/r/${res.conversationId}`);
      })
      .catch((error) => console.error(error));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="mt-10 flex w-1/3 flex-col gap-5"
    >
      <Input
        placeholder="Room Title"
        name="name"
        value={room.title}
        onChange={(e) => setRoom({ ...room, title: e.currentTarget.value })}
      />
      <div className="flex items-center gap-1">
        <Checkbox
          checked={room.isPrivate}
          onCheckedChange={(e) => setRoom({ ...room, isPrivate: e as boolean })}
        />
        <p>Private Room</p>
      </div>
      <Input
        placeholder="Password"
        name="password"
        value={room.password}
        onChange={(e) => setRoom({ ...room, password: e.currentTarget.value })}
        type="password"
        disabled={!room.isPrivate}
      />

      <button
        aria-label="Sign in"
        data-testid="login-button"
        type="submit"
        className="w-full transform rounded-md bg-green-500 py-2 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-green-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500"
      >
        Create
      </button>
    </form>
  );
}
