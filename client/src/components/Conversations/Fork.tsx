import { useState, useRef } from 'react';
import { GitFork } from 'lucide-react';
import { useRecoilState } from 'recoil';
import * as Popover from '@radix-ui/react-popover';
import { ForkOptions } from 'librechat-data-provider';
import { GitCommit, GitBranchPlus, ListTree } from 'lucide-react';
import { useForkConvoMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { Checkbox } from '~/components/ui';
// import type { UseMutationResult } from '@tanstack/react-query';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

interface PopoverButtonProps {
  children: React.ReactNode;
  setting: string;
  onClick: (setting: string) => void;
  setActiveSetting: React.Dispatch<React.SetStateAction<string>>;
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

const optionLabels = {
  [ForkOptions.DIRECT_PATH]: 'com_ui_fork_visible',
  [ForkOptions.INCLUDE_BRANCHES]: 'com_ui_fork_branches',
  [ForkOptions.TARGET_LEVEL]: 'com_ui_fork_all_target',
  default: 'com_ui_fork_from_message',
};

const PopoverButton: React.FC<PopoverButtonProps> = ({
  children,
  setting,
  onClick,
  setActiveSetting,
  timeoutRef,
}) => {
  return (
    <Popover.Close
      onClick={() => onClick(setting)}
      onMouseEnter={() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setActiveSetting(optionLabels[setting]);
      }}
      onMouseLeave={() => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setActiveSetting(optionLabels.default);
        }, 175);
      }}
      className="mx-1 h-full flex-1 rounded-lg border-2 bg-white transition duration-300 ease-in-out hover:bg-black dark:border-gray-400 dark:bg-gray-700/95 dark:text-gray-400 hover:dark:border-gray-200 hover:dark:text-gray-200"
      type="button"
    >
      {children}
    </Popover.Close>
  );
};

export default function Fork({
  isLast,
  messageId,
  conversationId,
  forkingSupported,
}: {
  isLast?: boolean;
  messageId: string;
  conversationId: string | null;
  forkingSupported?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [remember, setRemember] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [forkSetting, setForkSetting] = useRecoilState(store.forkSetting);
  const [rememberGlobal, setRememberGlobal] = useRecoilState(store.rememberForkOption);
  const [activeSetting, setActiveSetting] = useState(optionLabels.default);
  const forkConvo = useForkConvoMutation();

  if (!forkingSupported || !conversationId || !messageId) {
    return null;
  }

  const onClick = (option: string) => {
    if (remember) {
      setRememberGlobal(true);
      setForkSetting(option);
    }
    forkConvo.mutate({ messageId, conversationId, option });
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'hover-button active rounded-md p-1 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible ',
            'data-[state=open]:active data-[state=open]:bg-gray-200 data-[state=open]:text-gray-700 data-[state=open]:dark:bg-gray-700 data-[state=open]:dark:text-gray-200',
            !isLast ? 'data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100' : '',
          )}
          onClick={(e) => {
            if (rememberGlobal) {
              e.preventDefault();
              forkConvo.mutate({ messageId, conversationId, option: forkSetting });
            }
          }}
          type="button"
          title={localize('com_ui_continue')}
        >
          <GitFork className="h-4 w-4 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <div dir="ltr">
          <Popover.Content
            side="top"
            role="menu"
            className="bg-token-surface-primary flex min-h-[120px] flex-col gap-3 overflow-hidden rounded-lg bg-white p-2 px-3 shadow-lg dark:bg-gray-700/95"
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
                onClick={onClick}
                setting={ForkOptions.DIRECT_PATH}
              >
                <GitCommit className="h-full w-full rotate-90 p-2" />
              </PopoverButton>
              <PopoverButton
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                onClick={onClick}
                setting={ForkOptions.INCLUDE_BRANCHES}
              >
                <GitBranchPlus className="h-full w-full p-2" />
              </PopoverButton>
              <PopoverButton
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                onClick={onClick}
                setting={ForkOptions.TARGET_LEVEL}
              >
                <ListTree className="h-full w-full p-2" />
              </PopoverButton>
            </div>
            <div className="flex h-6 w-full items-center justify-start text-sm dark:text-gray-300">
              <Checkbox
                checked={remember}
                onCheckedChange={(checked: boolean) => {
                  if (checked) {
                    showToast({
                      message: localize('com_ui_fork_remember_checked'),
                      status: 'info',
                    });
                  }
                  setRemember(checked);
                }}
                className="m-2 transition duration-300 ease-in-out"
              />
              {localize('com_ui_fork_remember_setting')}
            </div>
          </Popover.Content>
        </div>
      </Popover.Portal>
    </Popover.Root>
  );
}
