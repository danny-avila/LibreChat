import { useState, useRef } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { GitCommit, GitBranchPlus, ListTree } from 'lucide-react';
// import type { UseMutationResult } from '@tanstack/react-query';
// import { useDeleteAssistantMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface PopoverButtonProps {
  children: React.ReactNode;
  setting: string;
  setActiveSetting: React.Dispatch<React.SetStateAction<string>>;
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

const PopoverButton: React.FC<PopoverButtonProps> = ({
  children,
  setting,
  setActiveSetting,
  timeoutRef,
}) => {
  return (
    <Popover.Close
      onMouseEnter={() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setActiveSetting(setting);
      }}
      onMouseLeave={() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setActiveSetting('com_ui_fork_from_message');
        }, 175);
      }}
      className="mx-1 h-full flex-1 rounded-lg border-2 bg-white transition duration-300 ease-in-out hover:bg-black dark:border-gray-400 dark:bg-gray-700/95 dark:text-gray-400 hover:dark:border-gray-200 hover:dark:text-gray-200"
      type="button"
    >
      {children}
    </Popover.Close>
  );
};

export default function Fork({ children }: { children: React.ReactNode }) {
  const localize = useLocalize();
  const [activeSetting, setActiveSetting] = useState('com_ui_fork_from_message');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // const mutation = useSomeMutation({
  //   onSuccess: (_, vars, context) => {
  //   },
  // });

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <div dir="ltr">
          <Popover.Content
            side="top"
            role="menu"
            className="bg-token-surface-primary flex min-h-[120px] flex-col gap-2 overflow-hidden rounded-lg bg-white p-1 px-3 shadow-lg dark:bg-gray-700/95"
            style={{ outline: 'none', pointerEvents: 'auto', boxSizing: 'border-box' }}
            tabIndex={-1}
            sideOffset={5}
            align="center"
          >
            <div className="flex h-6 w-full items-center justify-center text-sm dark:text-gray-200">
              {localize(activeSetting)}
            </div>
            <div className="flex h-full w-full items-center justify-center gap-1">
              <PopoverButton
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                setting={'com_ui_fork_visible'}
              >
                <GitCommit className="h-full w-full rotate-90 p-2" />
              </PopoverButton>
              <PopoverButton
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                setting={'com_ui_fork_branches'}
              >
                <GitBranchPlus className="h-full w-full p-2" />
              </PopoverButton>
              <PopoverButton
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                setting={'com_ui_fork_all_target'}
              >
                <ListTree className="h-full w-full p-2" />
              </PopoverButton>
            </div>
          </Popover.Content>
        </div>
      </Popover.Portal>
    </Popover.Root>
  );
}
