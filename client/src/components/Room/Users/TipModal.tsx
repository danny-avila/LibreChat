import { CryptoAddress, TUser } from 'librechat-data-provider';
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import {
  BlockchainNetwork,
  blockchainNetworks,
} from '~/components/Nav/SettingsTabs/Crypto/blockchain';
import { CheckMark, CoinIcon, CopyIcon } from '~/components/svg';
import { Button, Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { prettyEthAddress } from '~/utils/addressWrap';
import copy from 'copy-to-clipboard';

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
        {isCopied ? <CheckMark /> : <CopyIcon />}
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

  console.log(network);
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
  const [open, setOpen] = useState<boolean>(true);
  const [selectedNetwork, setSelectedNetwork] = useState<BlockchainNetwork | null>(null);
  const confirmTip = (v: boolean) => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      setSelectedNetwork(null);
    }
  }, [open]);

  console.log(open);

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
              <div className="grid w-full items-center gap-2">
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
                {/* <Button
                  className="border border-gray-20 bg-transparent text-gray-400 hover:bg-gray-50"
                  onClick={() => setSelectedNetwork(null)}
                >
                  Cancel
                </Button> */}
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
