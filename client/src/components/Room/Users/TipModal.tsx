import { CryptoAddress, TUser, request } from 'librechat-data-provider';
import React, { Dispatch, ReactNode, SetStateAction, useEffect, useState } from 'react';
import { BlockchainNetwork, blockchainNetworks } from '~/components/Nav/Crypto/Blockchain';
import { CheckMark, CoinIcon, CopyIcon } from '~/components/svg';
import { Button, Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { prettyEthAddress } from '~/utils/addressWrap';
import { useChatContext, useToastContext } from '~/Providers';
import copy from 'copy-to-clipboard';
import store from '~/store';
import { useRecoilState } from 'recoil';
import { useParams } from 'react-router-dom';
import { useInitSocket } from '~/hooks/useChatSocket';
import { useChatCall } from '~/hooks/useChatCall';
import { v4 } from 'uuid';
// eslint-disable-next-line import/no-cycle
import { TipTrack } from '~/components/Nav/AlarmBox';
import UserKickButton from './UserKickButton';
import HeartIcon from '~/components/svg/HeartIcon';

const AddressPicker = ({
  item,
  setSelectedNetwork,
}: {
  item: CryptoAddress;
  setSelectedNetwork: Dispatch<SetStateAction<BlockchainNetwork | null>>;
}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const copyToClipboard = () => {
    setSelectedNetwork(blockchainNetworks.filter((i) => i.id === item.id)[0]);
    setIsCopied(true);
    copy(item.address);

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  return (
    <div className="flex items-center justify-start gap-3 p-1" onClick={() => copyToClipboard()}>
      {blockchainNetworks.filter((i) => i.id === item.id)[0].icon}
      <div>
        <p className="mb-0 font-bold">{blockchainNetworks.filter((i) => i.id === item.id)[0].id}</p>
        <p>{prettyEthAddress(item.address.toLowerCase())}</p>
      </div>
      <button type="button">
        {isCopied ? <CheckMark /> : <CopyIcon className="text-gray-500 dark:text-white" />}
      </button>
    </div>
  );
};

export const TipCopiedContent = ({
  network,
  username,
  confirmTip,
}: {
  network: BlockchainNetwork;
  username: string;
  confirmTip: (v: boolean) => void;
}) => {
  return (
    <div className="w-full text-center">
      <div className="w-full">
        <h2 className="mb-2 flex justify-center gap-1 text-center text-xl">
          {network.icon}
          <b>
            {network.label}({network.id})
          </b>{' '}
          Address is Copied!
        </h2>
        <p className="mb-3">Only send funds to this address using {network.label} network.</p>
      </div>
      <Button
        className="bg-red-700 hover:bg-red-800"
        onClick={() => {
          confirmTip(true);
        }}
      >
        Notify @{username} of Tip
      </Button>
    </div>
  );
};

export default function TipModal({
  user,
  OpenButton,
  tip,
  isKarmaOnly = false,
}: {
  user: TUser;
  OpenButton?: ReactNode;
  tip?: TipTrack;
  isKarmaOnly?: boolean;
}) {
  const [isTip, setIsTip] = useState<boolean>(false);
  const socket = useInitSocket();
  const { conversation } = useChatContext();
  const { sendMessage } = useChatCall(socket);

  const [you, setYou] = useRecoilState(store.user);
  const params = useParams();
  const [open, setOpen] = useState<boolean>(false);
  const [selectedNetwork, setSelectedNetwork] = useState<BlockchainNetwork | null>(null);
  const [karma, setKarma] = useState<number>(1);
  const { showToast } = useToastContext();

  const { ask } = useChatContext();

  useEffect(() => {
    if (tip || isKarmaOnly) {
      setIsTip(true);
    }
  }, [tip, isKarmaOnly]);

  const sendTipMessage = (v: boolean) => {
    if (v) {
      request
        .post('/api/user/tip', {
          recipient: user._id ?? user.id,
          network: selectedNetwork?.id,
          convoId: params.conversationId,
        })
        .then(() => {
          if (ask) {
            ask(
              {
                text: `@${you?.username} has copied @${user.username} **${
                  selectedNetwork?.label
                }** Wallet Address: ${
                  user.cryptocurrency.filter((i) => selectedNetwork?.id === i.id)[0].address
                }`,
              },
              { isBot: 'Tip Bot' },
            );
          }
          showToast({ message: 'Tip sent successfully', status: 'success' });
        });
    }
    setOpen(false);
    setSelectedNetwork(null);
  };

  const sendKarma = () => {
    if (you) {
      if (you.karma < karma) {
        showToast({ message: 'You dont have enough karma points', status: 'error' });
      }
      request
        .post('/api/user/sendkarma', { karma, userId: user.id, convoId: params.conversationId })
        .then(() => {
          setYou({ ...you, karma: you.karma - karma });
          if (ask) {
            ask(
              {
                text: `@${you?.username} sent ${karma} Karma Point${karma > 1 ? 's' : ''} to @${user.username}`,
              },
              { isBot: 'Karma Bot' },
            );
          } else {
            sendMessage({
              text: `@${you?.username} has sent ${karma} Karma Point${karma > 1 ? 's' : ''} to @${user.username}`,
              sender: 'Karma Bot',
              isCreatedByUser: true,
              parentMessageId: v4(),
              conversationId: isKarmaOnly ? params.conversationId ?? '' : tip ? tip.convoId : '',
              messageId: v4(),
              thread_id: '',
              error: false,
            }, true);
          }
          showToast({ message: `You sent ${karma} karma points successfully`, status: 'success' });
          setOpen(false);
        }).catch(err => {
          if (err.response.status === 403) {
            showToast({ message: err.response.data.message, status: 'error' });
          }
        });
    }
  };

  useEffect(() => {
    if (you?.id === user._id) {
      setOpen(false);
      return;
    }
    if (!open) {
      setSelectedNetwork(null);
    }
  }, [open]);

  return (
    <Dialog onOpenChange={(e) => {
      if (you?.id === user._id || you?.username === 'guest-user') {
        setOpen(false);
        return;
      }
      setOpen(e);
    }} open={open}>
      <DialogTrigger asChild>
        {OpenButton ? (
          OpenButton
        ) : (
          <button>
            <CoinIcon size={18} />
          </button>
        )}
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={isTip ? `Send Karma to @${user.username}` : `Tip @${user.username}`}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              {isTip ?
                <div className="flex w-full flex-col items-center justify-around gap-1">
                  <p className="text-black dark:text-white">Send Karma Points to @{user.username}</p>
                  <p className="text-xs text-gray-700 dark:text-gray-50 mb-1">
                    Your Karma Points Balance: {you?.karma}
                  </p>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => <button
                      key={`karma-send-${i}`}
                      className={`rounded-full border-2 border-black px-3 text-black dark:border-gray-50 dark:text-gray-20 ${
                        karma === i ? 'bg-green-500' : ''
                      }`}
                      onClick={() => setKarma(i)}
                    >
                      {i}
                    </button>)}

                  </div>
                  <button
                    className="rounded-full bg-green-500 px-5 py-1 text-white transition hover:bg-green-550 mt-3"
                    onClick={sendKarma}
                  >
                    Send {karma} Karma point{karma > 1 ? 's' : ''}
                  </button>
                </div> : <div className="grid w-full items-center justify-center gap-2 text-gray-850 dark:text-white">
                  {selectedNetwork === null ? (
                    user.cryptocurrency &&
                  user.cryptocurrency.map((i) => (
                    <AddressPicker key={i.id} item={i} setSelectedNetwork={setSelectedNetwork} />
                  ))
                  ) : (
                    <TipCopiedContent
                      username={user.username}
                      network={selectedNetwork}
                      confirmTip={sendTipMessage}
                    />
                  )}
                </div>
              }
            </div>
          </>
        }
        footer={
          <div className="flex w-full justify-end">
            {selectedNetwork === null ? (
              <div className='flex w-full items-center justify-between'>
                <div className='flex gap-1'>
                  {user.cryptocurrency.length > 0 &&
                    <button
                      className='p-2 border-gray-600 rounded border-2 bg-gray-100 dark:bg-gray-800'
                      onClick={() => setIsTip(!isTip)}
                    >
                      {isTip ? <CoinIcon size={18} /> : <img src='/assets/love-icon.png' width={20} height={20} />}
                    </button>
                  }
                  {you?.id === conversation?.user?._id && you.id !== user._id && (
                    <div className='border-gray-600 rounded border-2 bg-gray-100 flex justify-center dark:bg-gray-800'>
                      <UserKickButton user={user} />
                    </div>
                  )}
                </div>
                <Button
                  className="border border-gray-20 bg-transparent text-black hover:bg-gray-50"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  className="rounded-2xl border border-gray-20 bg-transparent text-gray-400 hover:bg-gray-50"
                  onClick={() => sendTipMessage(false)}
                >
                  Tip Anonymously
                </Button>
              </>
            )}
          </div>
        }
      />
    </Dialog>
  );
}
