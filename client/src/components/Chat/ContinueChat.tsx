import React, { useState } from 'react';
import { Button, Input } from '../ui';
import { TConversation, request } from 'librechat-data-provider';
import { useLocation, useParams } from 'react-router-dom';
import { SetterOrUpdater, useRecoilState } from 'recoil';
import { useAuthContext } from '~/hooks';
import DialogTemplate from '../ui/DialogTemplate';
import { Dialog, DialogTrigger } from '../ui';
import store from '~/store';

interface Props {
  conversation: TConversation | null;
  setConversation: SetterOrUpdater<TConversation | null>;
}

export default function ContinueChat({ conversation, setConversation }: Props) {
  const [password, setPassword] = useState<string>('');
  const [passwordErr, setPasswordErr] = useState<string>('');
  const [passwordOpen, setPasswordOpen] = useState<boolean>(false);
  const [rooms, setRooms] = useRecoilState(store.rooms);
  const { conversationId } = useParams();
  const { user, logout } = useAuthContext();
  const location = useLocation();

  const handleContinue = () => {
    if (user?.username === 'guest-user') {
      localStorage.setItem('prevUrl', location.pathname);
      logout();
    } else {
      if (conversation?.isPrivate && conversation.password) {
        setPasswordOpen(true);
      } else {
        handleSubmit();
      }
    }
  };

  const handleSubmit = () => {
    request
      .post(`/api/rooms/join/${conversationId}`, { password })
      .then((responseData) => {
        setPasswordErr('');
        setPasswordOpen(false);
        setConversation(responseData);
        setRooms([responseData, ...rooms]);
      })
      .catch((error) => {
        if (error.response.status === 400) {
          setPasswordErr(error.response.data);
        } else {
          console.error(error);
        }
      });
  };

  return (
    <div className="flex w-full justify-center">
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogTrigger asChild>
          <button className="p-1 hover:text-black dark:hover:text-white"></button>
        </DialogTrigger>
        <DialogTemplate
          title="Join To the Private Room"
          className="max-w-[450px]"
          main={
            <div className="flex w-full flex-col items-center gap-2">
              <div className="grid w-full items-center gap-2">
                {/* <Label htmlFor="chatGptLabel" className="text-left text-sm font-medium">
                    {localize('com_ui_delete_conversation_confirm')} <strong>{title}</strong>
                  </Label> */}
                <Input
                  placeholder="Password"
                  value={password}
                  type="password"
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  required
                />
                {passwordErr && <p className="text-red-500">{passwordErr}</p>}
              </div>
            </div>
          }
          footer={
            <div className="flex w-full justify-end gap-3">
              <button
                onClick={handleSubmit}
                className="rounded-md bg-green-700 px-5 py-2 text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-800"
              >
                Join
              </button>
              <button
                onClick={() => setPasswordOpen(false)}
                className="rounded-md border bg-white px-5 py-2 text-black hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          }
        />
      </Dialog>
      <Button
        className="w-1/2 items-center rounded-full bg-blue-800 hover:bg-blue-500"
        onClick={handleContinue}
      >
        Continue Chat
      </Button>
    </div>
  );
}
