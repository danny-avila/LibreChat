import { Plus } from 'lucide-react';
import React from 'react';
import { Button, Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { blockchainNetworks } from './blockchain';
import { CryptoAddress } from 'librechat-data-provider/dist/types';

export default function NetworkSelect({ networks }: { networks: CryptoAddress[] }) {
  return (
    <Dialog
    //  onOpenChange={(e) => setOpen(e)} open={open}
    >
      <DialogTrigger asChild>
        <Button className="bg-green-500 hover:bg-green-600">
          <Plus />
          Add
        </Button>
      </DialogTrigger>
      <DialogTemplate
        showCloseButton={false}
        title={'Select Network'}
        className="max-w-[450px]"
        main={
          <>
            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex-start flex w-full items-center gap-3">
                {blockchainNetworks
                  .filter((item) => networks.filter((i) => i.id === item.id).length === 0)
                  .map((item) => (
                    <button
                      key={item.id}
                      className="flex flex-col items-center gap-1 rounded-md px-3 pt-1 outline-none hover:bg-gray-100"
                    >
                      {item.icon}
                      <p className="mb-0 font-bold">{item.id}</p>
                    </button>
                  ))}
              </div>
            </div>
          </>
        }
      />
    </Dialog>
  );
}
