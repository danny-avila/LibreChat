import { Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '~/components/ui';
import React, { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { cn, mapEndpoints } from '~/utils';
import { useMediaQuery } from '~/hooks';
import { EModelEndpoint } from 'librechat-data-provider';
import { useNavigate } from 'react-router-dom';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import { useAssistantsMapContext, useChatContext } from '~/Providers';

interface RoomState {
  title: string;
  isPrivate: boolean;
  password: string;
  endpoint: EModelEndpoint;
}

export default function NewRoomModal({
  open = false,
  setOpen,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const initialRoomState: RoomState = {
    title: '',
    isPrivate: false,
    password: '',
    endpoint: EModelEndpoint.openAI,
  };
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const [room, setRoom] = useState<RoomState>(initialRoomState);

  // const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
  //   e.preventDefault();
  //   const result = await request.post('/api/rooms', room);
  //   navigate(`/r/${result.roomId}`);
  //   console.log(result);
  // };

  const { ask } = useChatContext();

  const submitNewRoom = useCallback(() => {
    if (!room.title) {
      return console.warn('No title provided to submit new room');
    }
    ask({
      text: `Say User Created new multi user room with topic '${room.title}'. This room is ${
        room.isPrivate ? 'private' : 'public'
      } and joined users can continue chat with chatbots & images bots here with same Topic and Endpoints`,
    });
  }, [ask]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          'p-5 shadow-2xl dark:bg-gray-800 dark:text-white md:min-h-[373px] md:w-[680px]',
          isSmallScreen ? 'top-20 -translate-y-0' : '',
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4 text-lg font-medium leading-6 text-gray-800 dark:text-gray-200">
            Create New Room
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitNewRoom();
          }}
          className="flex flex-col gap-5"
        >
          <Input
            placeholder="Room Topic"
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
      </DialogContent>
    </Dialog>
  );
}
