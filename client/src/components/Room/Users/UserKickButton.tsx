import React, { useContext } from 'react';
import { Dialog, DialogTrigger, Label } from '../../ui';
import DialogTemplate from '../../ui/DialogTemplate';
import { TConversation, request } from 'librechat-data-provider';
import { useChatContext, useToastContext } from '~/Providers';
import { ThemeContext } from '~/hooks';

export default function UserKickButton({ user }) {
  const { conversation, setConversation } = useChatContext();
  const { showToast } = useToastContext();
  const { theme } = useContext(ThemeContext);

  const confirmKick = () => {
    request
      .post(`/api/rooms/kick/${conversation?.conversationId}`, { userId: user._id })
      .then(() => {
        setConversation((prevConv: TConversation) => ({
          ...prevConv,
          users: prevConv?.users?.filter((i) => i !== userId),
        }));
        showToast({ message: `Kicked ${user.name}`, status: 'success' });
      })
      .catch((error) => {
        console.log(error);
        showToast({ message: 'Error to kick user', status: 'error' });
      });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-1 hover:text-black dark:hover:text-white">
          <img
            src={theme === 'light' ? '/assets/user-kick-dark.png' : '/assets/user-kick.png'}
            width={20}
            height={20}
          />
        </button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={`Confirm to kick @${user.username}`}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                  Are you sure you want to kick @{user.username} from the Room?
                </Label>
              </div>
            </div>
          </>
        }
        selection={{
          selectHandler: confirmKick,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: 'Kick',
        }}
      />
    </Dialog>
  );
}
