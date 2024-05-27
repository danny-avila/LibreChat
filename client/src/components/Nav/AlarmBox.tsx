import { CryptoId, TUser, request } from 'librechat-data-provider';
import React, { Dispatch, FC, HTMLAttributes, SetStateAction, useContext, useEffect, useRef, useState } from 'react';
import { BellIcon, DotsIcon } from '~/components/svg';
import { Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { blockchainNetworks } from './Crypto/Blockchain';
// eslint-disable-next-line import/no-cycle
import TipModal from '../Room/Users/TipModal';
import { ThemeContext, useAuthContext, useToast } from '~/hooks';

function formatDate(date: Date) {
  const currentDate = new Date();
  const givenDate = new Date(date);
  const timeDiff = currentDate.getTime() - givenDate.getTime();
  const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

  if (daysDiff >= 1) {
    // If the date is more than a day old, format it as YYYY-MM-DD
    const year = givenDate.getFullYear();
    const month = String(givenDate.getMonth() + 1).padStart(2, '0');
    const day = String(givenDate.getDate()).padStart(2, '0');
    return `${month}/${day}/${year}`;
  } else {
    // If the date is within the last 24 hours, format it as a time duration
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
    }
  }
}

export interface TipTrack {
  sender: TUser;
  recipient: TUser;
  network: CryptoId;
  createdAt: Date;
  updatedAt: Date;
  _id: string;
  sendType?: string;
  status: 'Pending' | 'Confirmed';
  karma: number;
  convoId: string;
}

interface DetailsDropDownPropsTyp extends HTMLAttributes<HTMLUListElement> {
  name: string;
  tip: TipTrack;
  isDetailView: boolean;
  setTips: Dispatch<SetStateAction<TipTrack[]>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const DetailsDropDown = React.forwardRef<HTMLUListElement, DetailsDropDownPropsTyp>(
  ({ tip, isDetailView, setTips, setOpen }) => {
    const { showToast } = useToast();

    const handleDelete = (tip: TipTrack) => {
      console.log(tip);
      setOpen(false);
      request.delete(`/api/user/tip/${tip._id}`).then((res) => {
        setTips((prevTips) => prevTips.filter((i) => i._id === res));
      });
    };

    const handleMute = (tip: TipTrack) => {
      setOpen(false);
      request.post(`/api/user/mute/${tip.sender.id}`).then((res) => {
        console.log(res);
        showToast({ status: 'success', message: `Muted @${tip.sender.username}'s notification` });
      });
    };

    return (
      <ul className={`${isDetailView ? 'block': 'hidden'} absolute -left-16 md:left-0 top-14 cursor-pointer text-nowrap rounded-md bg-white dark:bg-gray-800 dark:text-white z-10 shadow-md`}>
        <li
          className="h-full w-full rounded-t-md px-4 py-3 hover:bg-slate-200"
          onClick={() => handleDelete(tip)}
        >
            Delete Notification
        </li>
        <li className="h-full w-full rounded-b-md px-4 py-3 hover:bg-slate-200" onClick={() => handleMute(tip)}>
          Mute User
        </li>
      </ul>
    );
  },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MessageComponent: FC<{ tip: TipTrack; setTips: any }> = ({ tip, setTips }) => {
  const [isDetailView, setIsDetailView] = useState<boolean>(false);
  const { user } = useAuthContext();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const outSideClickHandler = (e) => {
    if (dropdownRef.current && !dropdownRef.current?.contains(e.target)) {
      setIsDetailView(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', outSideClickHandler);
    return () => document.removeEventListener('mousedown', outSideClickHandler);
  }, []);

  return (
    <div className={'flex w-full items-center justify-between gap-2'}>
      {tip.sendType && tip.sendType === 'karma' ? (
        <div className="flex gap-1">
          <img src="/assets/karmabot.png" className="h-10 w-10 rounded-full" />
          <p className="text-black dark:text-white">
            @{tip.sender.username} sent {tip.karma} karma points to you.
          </p>
        </div>
      ) : (
        <div className="flex gap-1">
          <img src="/assets/tipbot.png" className="h-10 w-10 rounded-full" />
          <p className="text-black dark:text-white">
                          please click{' '}
            <a
              href={blockchainNetworks.filter((p) => tip.network === p.id)[0].scanUrl.replace('(walletaddress)', user?.cryptocurrency.filter(i => i.id === tip.network)[0].address ?? '')}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 underline"
            >
              here
            </a>{' '}
                          to confirm if you received a{' '}
            {blockchainNetworks.filter((p) => tip.network === p.id)[0].label} tip from{' '}
            <TipModal
              user={tip.sender}
              tip={tip}
              OpenButton={<b className="cursor-pointer">@{tip.sender.username}</b>}
            />
          </p>
        </div>
      )}
      <div className="relative flex flex-col items-end" ref={dropdownRef}>
        <span className="text-xs text-black dark:text-gray-100">
          {formatDate(tip.createdAt)}
        </span>
        <button onClick={() => setIsDetailView(!isDetailView)}>
          {' '}
          <DotsIcon />
        </button>
        {
          <DetailsDropDown name="Melody" tip={tip} setTips={setTips} setOpen={setIsDetailView} isDetailView={isDetailView} />
        }
      </div>
    </div>
  );
};

export default function AlarmBox({
  tips,
  setTips,
}: {
  tips: TipTrack[];
  setTips: Dispatch<SetStateAction<TipTrack[]>>;
}) {
  const { theme } = useContext(ThemeContext);

  return (
    <Dialog
    //  onOpenChange={(e) => setOpen(e)} open={open}
    >
      <DialogTrigger asChild>
        <button className="relative">
          <BellIcon color={theme === 'light' ? '#000000' : '#ffffff'} />
          {tips.length !== 0 && (
            <span className="absolute -right-3 -top-3 py-0 px-[5px] rounded-md text-[10px] bg-red-500 text-white">
              {tips.length}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={'Bot Notifications'}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex w-full flex-col items-start justify-around gap-1">
                {tips.map((tip) => (
                  <MessageComponent key={tip._id} setTips={setTips} tip={tip} />
                ))}

                <p className="text-xs text-gray-700 dark:text-gray-50"></p>
                <div className="flex gap-1"></div>
              </div>
            </div>
          </>
        }
        footer={<div className="flex w-full justify-end"></div>}
      />
    </Dialog>
  );
}
