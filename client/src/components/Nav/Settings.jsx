import GearIcon from "../svg/GearIcon";
import { Dialog, DialogTrigger } from "../ui/Dialog.tsx";
import * as Tabs from "@radix-ui/react-tabs";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog.tsx";
import { useEffect } from 'react';
import { cn } from "~/utils/";
import { useClearConversationsMutation } from '~/data-provider';
import store from '~/store';
import ColorSelect from "./ColorSelect.jsx";

export default function ClearConvos() {
	const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const clearConvosMutation = useClearConversationsMutation();

  const clearConvos = () => {
    console.log('Clearing conversations...');
    clearConvosMutation.mutate();
  };

  useEffect(() => {
    if (clearConvosMutation.isSuccess) {
      newConversation();
      refreshConversations();
    }
  }, [clearConvosMutation.isSuccess]);
	
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10">
          <GearIcon />
          Settings
        </button>
      </DialogTrigger>

      <DialogContent
        className={cn("shadow-2xl dark:bg-gray-900 dark:text-white")}
      >
        <DialogHeader>
          <DialogTitle className="text-gray-800 dark:text-white">
            Settings
          </DialogTitle>
        </DialogHeader>
        <div className="px-6">
          <Tabs.Root
            defaultValue="general"
            className="flex flex-col gap-6 md:flex-row"
            orientation="vertical"
          >
            <Tabs.List
              aria-label="Settings"
              role="tablist"
              aria-orientation="vertical"
              className="-ml-[8px] flex min-w-[180px] flex-shrink-0 flex-col"
              style={{ outline: "none" }}
            >
              <Tabs.Trigger
                className="flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm radix-state-active:bg-gray-800 radix-state-active:text-white"
                value="general"
              >
                <GearIcon />
                General
              </Tabs.Trigger>
              {/* <Tabs.Trigger
								className="flex items-center justify-start gap-2 rounded-md px-2 py-1.5 text-sm radix-state-active:bg-gray-800 radix-state-active:text-white"
								value="personalization"
							>
								Personalization
							</Tabs.Trigger> */}
            </Tabs.List>

            <Tabs.Content
              value="general"
              role="tabpanel"
              className="w-full md:min-h-[300px]"
            >
              <div className="flex flex-col gap-3 text-sm text-gray-600 dark:text-gray-300">
                <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>Color Scheme</div>
                    {/* <select className="rounded border border-black/10 bg-transparent text-sm dark:border-white/20 p-2 px-4">
                      <option value="system">System</option>
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select> */}
										<ColorSelect />
                  </div>
                </div>
                <div className="border-b pb-3 last-of-type:border-b-0 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>Clear all chats</div>
                    <button className="btn relative bg-red-600  hover:bg-red-800 text-white">
                      <div className="flex w-full gap-2 items-center justify-center" onClick={clearConvos}>
                        Clear
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </Tabs.Content>
            {/* <Tabs.Content value="personalization" role="tabpanel" className="w-full md:min-h-[300px]"> 
							Personalization
						</Tabs.Content> */}
          </Tabs.Root>
        </div>
      </DialogContent>
    </Dialog>
  );
}
