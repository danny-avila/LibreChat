import { CryptoAddress, TUser, request } from 'librechat-data-provider';
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { BlockchainNetwork, blockchainNetworks } from '~/components/Nav/Crypto/Blockchain';
import { CheckMark, CoinIcon, CopyIcon } from '~/components/svg';
import { Button, Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { prettyEthAddress } from '~/utils/addressWrap';
import { useChatContext, useToastContext } from '~/Providers';
import copy from 'copy-to-clipboard';
import store from '~/store';
import { useRecoilState } from 'recoil';

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
    <div className="flex items-center justify-start gap-3 p-1">
      {blockchainNetworks.filter((i) => i.id === item.id)[0].icon}
      <div>
        <p className="mb-0 font-bold">{blockchainNetworks.filter((i) => i.id === item.id)[0].id}</p>
        <p>{prettyEthAddress(item.address.toLowerCase())}</p>
      </div>
      <button onClick={() => copyToClipboard()} type="button">
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

export default function TipModal({ user }: { user: TUser }) {
  const [you, setYou] = useRecoilState(store.user);
  const [open, setOpen] = useState<boolean>(true);
  const [selectedNetwork, setSelectedNetwork] = useState<BlockchainNetwork | null>(null);
  const [karma, setKarma] = useState<number>(1);
  const { showToast } = useToastContext();

  const { ask } = useChatContext();

  const confirmTip = (v: boolean) => {
    if (v) {
      ask(
        {
          text: `@${you?.username} has copied @${user.username} ${
            selectedNetwork?.label
          } Address: ${
            user.cryptocurrency.filter((i) => selectedNetwork?.id === i.id)[0].address
          } - awaiting confirmation`,
        },
        { isBot: 'Tip Bot' },
      );
    }
    setOpen(false);
    setSelectedNetwork(null);
  };

  const sendKarma = () => {
    if (you) {
      if (you.karma < karma) {
        showToast({ message: 'You dont have enough karma points', status: 'error' });
      }

      request.post('/api/user/sendkarma', { karma, userId: user.id }).then(() => {
        setYou({ ...you, karma: you.karma - karma });
        ask(
          {
            text: `@${you?.username} sent ${karma} to @${user.username} `,
          },
          { isBot: 'Karma Bot' },
        );
        showToast({ message: 'Karma sent successfully', status: 'success' });
      });
    }
  };

  useEffect(() => {
    if (!open) {
      setSelectedNetwork(null);
    }
  }, [open]);

  return (
    <Dialog
    //  onOpenChange={(e) => setOpen(e)} open={open}
    >
      <DialogTrigger asChild>
        <button>
          <CoinIcon size={18} />
        </button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={`Tip @${user.username}`}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex w-full flex-col items-start justify-around gap-1">
                <p>Send Karma Points to @{user.username}</p>
                <p className="text-xs text-gray-700">Your Karma Points Balance: {you?.karma}</p>
                <div className="flex gap-1">
                  <button
                    className={`rounded-full border-2 border-black px-3 ${
                      karma === 1 ? 'bg-green-500' : ''
                    }`}
                    onClick={() => setKarma(1)}
                  >
                    1
                  </button>
                  <button
                    className={`rounded-full border-2 border-black px-3 ${
                      karma === 2 ? 'bg-green-500' : ''
                    }`}
                    onClick={() => setKarma(2)}
                  >
                    2
                  </button>
                  <button
                    className={`rounded-full border-2 border-black px-3 ${
                      karma === 3 ? 'bg-green-500' : ''
                    }`}
                    onClick={() => setKarma(3)}
                  >
                    3
                  </button>
                  <button
                    className={`rounded-full border-2 border-black px-3 ${
                      karma === 4 ? 'bg-green-500' : ''
                    }`}
                    onClick={() => setKarma(4)}
                  >
                    4
                  </button>
                  <button
                    className={`rounded-full border-2 border-black px-3 ${
                      karma === 5 ? 'bg-green-500' : ''
                    }`}
                    onClick={() => setKarma(5)}
                  >
                    5
                  </button>
                </div>
                <button
                  className="rounded-full bg-green-500 px-5 py-1 text-white transition hover:bg-green-550"
                  onClick={sendKarma}
                >
                  Send {karma} Karma points
                </button>
              </div>
              <div className="grid w-full items-center gap-2 text-gray-850 dark:text-white">
                {selectedNetwork === null ? (
                  user.cryptocurrency &&
                  user.cryptocurrency.map((i) => (
                    <AddressPicker key={i.id} item={i} setSelectedNetwork={setSelectedNetwork} />
                  ))
                ) : (
                  <TipCopiedContent
                    username={user.username}
                    network={selectedNetwork}
                    confirmTip={confirmTip}
                  />
                )}
              </div>
            </div>
          </>
        }
        footer={
          <div className="flex w-full justify-end">
            {selectedNetwork === null ? (
              <Button
                className="border border-gray-20 bg-transparent text-black hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  className="rounded-2xl border border-gray-20 bg-transparent text-gray-400 hover:bg-gray-50"
                  onClick={() => confirmTip(false)}
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
