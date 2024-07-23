/* eslint-disable indent */
import { Plus } from 'lucide-react';
import React from 'react';
import { Button, Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { blockchainNetworks, networkTokens } from './Blockchain';
import { CryptoAddress, CryptoId } from 'librechat-data-provider/dist/types';
import Marquee from 'react-fast-marquee';

export default function NetworkSelect({
  networks,
  newNetwork,
}: {
  networks: CryptoAddress[];
  newNetwork: (id: CryptoId) => void;
}) {
  const [open, setOpen] = React.useState<boolean>(false);
  const [selectedNetwork, setSelectedNetwork] = React.useState<CryptoId | null>(null);

  return (
    <Dialog onOpenChange={(e) => setOpen(e)} open={open}>
      <DialogTrigger asChild>
        <Button className="bg-green-500 hover:bg-green-600">
          <Plus />
          Add
        </Button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={selectedNetwork ? 'Select Token' : 'Select Network'}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-start gap-2">
              {selectedNetwork && (
                <Button
                  className="border border-gray-400 bg-transparent text-gray-800 hover:bg-transparent"
                  onClick={() => {
                    setSelectedNetwork(null);
                  }}
                >
                  Back
                </Button>
              )}
              <div className="flex-start grid w-full grid-cols-5 items-center justify-start gap-3">
                {selectedNetwork ? (
                  <>
                    {networks.filter((item) => item.id === selectedNetwork).length === 0 && (
                      <button
                        key={selectedNetwork}
                        className="flex h-full flex-col items-center justify-start gap-1 rounded-md pt-1 text-black outline-none hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                        onClick={() => {
                          newNetwork(selectedNetwork);
                          setSelectedNetwork(null);
                          setOpen(false);
                        }}
                      >
                        {blockchainNetworks.find((item) => item.id === selectedNetwork)?.icon}
                        <div className="mb-0 font-bold">
                          <p className="w-full break-words">
                            {blockchainNetworks.find((item) => item.id === selectedNetwork)?.label}
                          </p>
                          <p>
                            ({blockchainNetworks.find((item) => item.id === selectedNetwork)?.id})
                          </p>
                        </div>
                      </button>
                    )}

                    {networkTokens
                      .filter((item) => item.blockchain === selectedNetwork)
                      .filter((item) => networks.filter((i) => i.id === item.id).length === 0)
                      .map((item) => (
                        <button
                          key={item.id}
                          className="flex h-full flex-col items-center justify-start gap-1 rounded-md pt-1 text-black outline-none hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                          onClick={() => {
                            newNetwork(item.id);
                            setSelectedNetwork(null);
                            setOpen(false);
                          }}
                        >
                          {item.icon}
                          <div className="mb-0 w-full break-words font-bold">
                            <p className="w-full break-words">
                              {item.label.length > 7 ? (
                                <Marquee speed={10}>{item.label} </Marquee>
                              ) : (
                                item.label
                              )}
                            </p>
                            <p>({item.id})</p>
                          </div>
                        </button>
                      ))}
                  </>
                ) : (
                  blockchainNetworks
                    .filter((item) => item.type !== 'Token')
                    .filter(
                      (item) =>
                        networkTokens.filter((i) => i.blockchain === item.id).length > 0 ||
                        networks.filter((i) => i.id === item.id).length === 0,
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        className="flex flex-col items-center gap-1 rounded-md px-3 pt-1 text-black outline-none hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
                        onClick={() => {
                          if (networkTokens.filter((i) => i.blockchain === item.id).length > 0) {
                            setSelectedNetwork(item.id);
                            return;
                          }
                          newNetwork(item.id);
                          setOpen(false);
                        }}
                      >
                        {item.icon}
                        <p className="mb-0 font-bold">{item.id}</p>
                      </button>
                    ))
                )}
              </div>
            </div>
          </>
        }
      />
    </Dialog>
  );
}
