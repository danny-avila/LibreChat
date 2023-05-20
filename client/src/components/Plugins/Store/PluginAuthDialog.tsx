import { useEffect, useState } from 'react';
import { TPlugin, TPluginAuthConfig } from '~/data-provider';
import { Dialog, DialogTemplate, DialogClose, Input, Label } from '~/components/ui';
import { cn } from '~/utils/';

type TPluginAuthDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  plugin: TPlugin;
  onSubmit: () => void;
};

const defaultTextProps =
'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

function PluginAuthDialog({ isOpen, setIsOpen, plugin, onSubmit }: TPluginAuthDialogProps) {

  const handleSubmit = () => {
    onSubmit();
    setIsOpen(false);
  };
  console.log('PluginAuthDialog', plugin);
  console.log('PluginAuthDialog', isOpen);
  
  return (
    <Dialog isOpen={isOpen} setIsOpen={setIsOpen} className="relative z-100">
      <DialogTemplate
        title="Plugin Authentication"
        main={
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full gap-6 sm:grid-cols-2">
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                {plugin.authConfig?.map((config: TPluginAuthConfig, i: number) => (
                  <div key={`${config.name}-${i}`} className="flex flex-col gap-1">
                    <Label htmlFor={config.name} className="text-left text-sm font-medium">
                      {config.label}
                    </Label>
                    <Input
                      id={config.name}
                      className={cn(
                        defaultTextProps,
                        'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                      )}
                    /> 
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
        buttons={
          <>
            <DialogClose
              onClick={handleSubmit}
              className="dark:hover:gray-400 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
            >
              Save
            </DialogClose>
          </>
        }
      />
    </Dialog>
  );
}

export default PluginAuthDialog;
