import { CryptoId, TUser, request } from 'librechat-data-provider';
import React, { Dispatch, SetStateAction, useContext, useEffect, useRef } from 'react';
import { BellIcon, TrashIcon } from '~/components/svg';
import { Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { blockchainNetworks } from './Crypto/Blockchain';
import TipModal from '../Room/Users/TipModal';
import { ThemeContext } from '~/hooks';

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
}

// interface DetailsDropDownPropsTyp extends HTMLAttributes<HTMLUListElement> {
//   name: string;
//   tip: TipTrack;
//   setTips: Dispatch<SetStateAction<TipTrack[]>>;
// }

// const DetailsDropDown = React.forwardRef<HTMLUListElement, DetailsDropDownPropsTyp>(
//   ({ name, tip, setTips, ...props }, ref) => {
//     const confirmTip = () => {
//       request.post('/api/confirmtip', { trxId: tip._id });
//     };

//     const handleDelete = () => {
//       // request.delete(`/api/tip/${tip._id}`).then((res) => {
//       //   setTips((prevTips) => prevTips.filter((i) => i._id === ((res._id as string) || '')));
//       // });
//     };

//     return (
//       <ul className="absolute left-0 top-14 cursor-pointer text-nowrap rounded-md bg-white">
//         <li
//           className="h-full w-full rounded-t-md px-4 py-3 hover:bg-slate-200"
//           onClick={handleDelete}
//         >
//           Delete Notification
//         </li>
//         {/* <li className="h-full w-full px-4 py-3 hover:bg-slate-200">Check Latest Transactions</li> */}
//         <li className="h-full w-full px-4 py-3 hover:bg-slate-200" onClick={confirmTip}>
//           Confirm Tip Received
//         </li>
//         {/* <li className="h-full w-full rounded-b-md px-4 py-3 hover:bg-slate-200">
//           Turn off notifications
//         </li> */}
//       </ul>
//     );
//   },
// );

export default function AlarmBox({
  tips,
  setTips,
}: {
  tips: TipTrack[];
  setTips: Dispatch<SetStateAction<TipTrack[]>>;
}) {
  const { theme } = useContext(ThemeContext);
  // const [isDetailView, setIsDetailView] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLButtonElement>(null);
  const outSideClickHandler = (e) => {
    if (dropdownRef.current && !dropdownRef.current?.contains(e.target)) {
      // setIsDetailView(false);
    }
  };

  useEffect(() => {
    console.log('rendered');
    document.addEventListener('mousedown', outSideClickHandler);
    return () => document.removeEventListener('mousedown', outSideClickHandler);
  }, []);

  const handleDelete = (tip: TipTrack) => {
    request.delete(`/api/user/tip/${tip._id}`).then((res) => {
      setTips((prevTips) => prevTips.filter((i) => i._id === res));
    });
  };

  return (
    <Dialog
    //  onOpenChange={(e) => setOpen(e)} open={open}
    >
      <DialogTrigger asChild>
        <button className="relative">
          <BellIcon color={theme === 'light' ? '#000000' : '#ffffff'} />
          {tips.length !== 0 && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-red-500"></span>
          )}
        </button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={'System Message Box'}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex w-full flex-col items-start justify-around gap-1">
                {tips.map((tip) => (
                  <div key={tip._id} className="flex w-full items-center justify-between gap-2">
                    {tip.sendType && tip.sendType === 'karma' ? (
                      <div className="flex gap-1">
                        <img src="/assets/karmabot.png" className="h-10 w-10 rounded-full" />
                        <p className="text-black dark:text-white">
                          @{tip.sender.username} sent {tip.karma} karma points{' '}
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <img src="/assets/tipbot.png" className="h-10 w-10 rounded-full" />
                        <p className="text-black dark:text-white">
                          please click{' '}
                          <a
                            href={blockchainNetworks.filter((p) => tip.network === p.id)[0].scanUrl}
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
                            OpenButton={<b className="cursor-pointer">@{tip.sender.username}</b>}
                          />
                        </p>
                      </div>
                    )}
                    <div className="relative flex flex-col items-end">
                      <span className="text-xs text-black dark:text-gray-100">
                        {formatDate(tip.createdAt)}
                      </span>
                      <button
                        onClick={() => handleDelete(tip)}
                        className="w-8 rounded-md bg-red-600 p-2 text-white"
                      >
                        <TrashIcon />
                      </button>
                      <button
                        onClick={() => handleDelete(tip)}
                        className="w-8 rounded-md bg-red-600 p-2 text-white"
                      >
                      </button>
                      {/* <button onClick={() => setIsDetailView(!isDetailView)} ref={dropdownRef}>
                        {' '}
                        <DotsIcon />
                      </button> */}
                      {/* {isDetailView && (
                        <DetailsDropDown name="Melody" tip={tip} setTips={setTips} />
                      )} */}
                    </div>
                  </div>
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
