import React from 'react';
import { Dialog, DialogTrigger, Label } from '../ui';
import DialogTemplate from '../ui/DialogTemplate';
import { LogOutIcon } from 'lucide-react';
import { request } from 'librechat-data-provider';
import { useRecoilState } from 'recoil';
import store from '~/store';

export default function LeaveButton({ conversationId, title }) {
  const [rooms, setRooms] = useRecoilState(store.rooms);

  const confirmLeave = () => {
    request
      .post(`/api/rooms/leave/${conversationId}`)
      .then(() => setRooms(rooms.filter((r) => r.conversationId !== conversationId)))
      .catch((error) => console.error(error));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-1 hover:text-black dark:hover:text-white">
          <LogOutIcon size={15} />
        </button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={'Leave Room'}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                  Are you sure you want to leave this room? &quot;<strong>{title}&quot;</strong>
                </Label>
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler: confirmLeave,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: 'Leave',
        }}
      />
    </Dialog>
  );
}
