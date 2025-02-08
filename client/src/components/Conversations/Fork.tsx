import { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { GitFork, InfoIcon } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { ForkOptions } from 'librechat-data-provider';
import { GitCommit, GitBranchPlus, ListTree } from 'lucide-react';
import {
  Checkbox,
  HoverCard,
  HoverCardTrigger,
  HoverCardPortal,
  HoverCardContent,
} from '~/components/ui';
import OptionHover from '~/components/SidePanel/Parameters/OptionHover';
import { TranslationKeys, useLocalize, useNavigateToConvo } from '~/hooks';
import { useForkConvoMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { ESide } from '~/common';
import { cn } from '~/utils';
import store from '~/store';

interface PopoverButtonProps {
  children: React.ReactNode;
  setting: string;
  onClick: (setting: string) => void;
  setActiveSetting: React.Dispatch<React.SetStateAction<string>>;
  sideOffset?: number;
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hoverInfo?: React.ReactNode | string;
  hoverTitle?: React.ReactNode | string;
  hoverDescription?: React.ReactNode | string;
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
  sideOffset = 30,
  timeoutRef,
  hoverInfo,
  hoverTitle,
  hoverDescription,
}) => {
  return (
    <HoverCard openDelay={200}>
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
        className="mx-1 max-w-14 flex-1 rounded-lg border-2 bg-white text-gray-700 transition duration-300 ease-in-out hover:bg-gray-200 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-100 "
        type="button"
      >
        {children}
      </Popover.Close>
      {((hoverInfo != null && hoverInfo !== '') ||
        (hoverTitle != null && hoverTitle !== '') ||
        (hoverDescription != null && hoverDescription !== '')) && (
        <HoverCardPortal>
          <HoverCardContent
            side="right"
            className="z-[999] w-80 dark:bg-gray-700"
            sideOffset={sideOffset}
          >
            <div className="space-y-2">
              <p className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                {hoverInfo != null && hoverInfo !== '' && hoverInfo}
                {hoverTitle != null && hoverTitle !== '' && (
                  <span className="flex flex-wrap gap-1 font-bold">{hoverTitle}</span>
                )}
                {hoverDescription != null && hoverDescription !== '' && hoverDescription}
              </p>
            </div>
          </HoverCardContent>
        </HoverCardPortal>
      )}
    </HoverCard>
  );
};

export default function Fork({
  isLast = false,
  messageId,
  conversationId: _convoId,
  forkingSupported = false,
  latestMessageId,
}: {
  isLast?: boolean;
  messageId: string;
  conversationId: string | null;
  forkingSupported?: boolean;
  latestMessageId?: string;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [remember, setRemember] = useState(false);
  const { navigateToConvo } = useNavigateToConvo();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [forkSetting, setForkSetting] = useRecoilState(store.forkSetting);
  const [activeSetting, setActiveSetting] = useState(optionLabels.default);
  const [splitAtTarget, setSplitAtTarget] = useRecoilState(store.splitAtTarget);
  const [rememberGlobal, setRememberGlobal] = useRecoilState(store.rememberDefaultFork);
  const forkConvo = useForkConvoMutation({
    onSuccess: (data) => {
      navigateToConvo(data.conversation);
      showToast({
        message: localize('com_ui_fork_success'),
        status: 'success',
      });
    },
    onMutate: () => {
      showToast({
        message: localize('com_ui_fork_processing'),
        status: 'info',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_fork_error'),
        status: 'error',
      });
    },
  });

  const conversationId = _convoId ?? '';
  if (!forkingSupported || !conversationId || !messageId) {
    return null;
  }

  const onClick = (option: string) => {
    if (remember) {
      setRememberGlobal(true);
      setForkSetting(option);
    }

    forkConvo.mutate({
      messageId,
      conversationId,
      option,
      splitAtTarget,
      latestMessageId,
    });
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className={cn(
            'hover-button active rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-500 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible ',
            'data-[state=open]:active focus:opacity-100 data-[state=open]:bg-gray-100 data-[state=open]:text-gray-500 data-[state=open]:dark:bg-gray-700  data-[state=open]:dark:text-gray-200',
            !isLast ? 'data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100' : '',
          )}
          onClick={(e) => {
            if (rememberGlobal) {
              e.preventDefault();
              forkConvo.mutate({
                messageId,
                splitAtTarget,
                conversationId,
                option: forkSetting,
                latestMessageId,
              });
            }
          }}
          type="button"
          title={localize('com_ui_fork')}
        >
          <GitFork className="h-4 w-4 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <div dir="ltr">
          <Popover.Content
            side="top"
            role="menu"
            className="bg-token-surface-primary flex min-h-[120px] min-w-[215px] flex-col gap-3 overflow-hidden rounded-lg bg-white p-2 px-3 shadow-lg dark:bg-gray-700"
            style={{ outline: 'none', pointerEvents: 'auto', boxSizing: 'border-box' }}
            tabIndex={-1}
            sideOffset={5}
            align="center"
          >
            <div className="flex h-6 w-full items-center justify-center text-sm dark:text-gray-200">
              {localize(activeSetting as TranslationKeys)}
              <HoverCard openDelay={50}>
                <HoverCardTrigger asChild>
                  <InfoIcon className="ml-auto flex h-4 w-4 gap-2 text-gray-500 dark:text-white/50" />
                </HoverCardTrigger>
                <HoverCardPortal>
                  <HoverCardContent
                    side="right"
                    className="z-[999] w-80 dark:bg-gray-700"
                    sideOffset={19}
                  >
                    <div className="flex flex-col gap-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                      <span>{localize('com_ui_fork_info_1')}</span>
                      <span>{localize('com_ui_fork_info_2')}</span>
                      <span>
                        {localize('com_ui_fork_info_3', { 0: localize('com_ui_fork_split_target') })}
                      </span>
                    </div>
                  </HoverCardContent>
                </HoverCardPortal>
              </HoverCard>
            </div>
            <div className="flex h-full w-full items-center justify-center gap-1">
              <PopoverButton
                sideOffset={155}
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                onClick={onClick}
                setting={ForkOptions.DIRECT_PATH}
                hoverTitle={
                  <>
                    <GitCommit className="h-5 w-5 rotate-90" />
                    {localize(optionLabels[ForkOptions.DIRECT_PATH]as TranslationKeys)}
                  </>
                }
                hoverDescription={localize('com_ui_fork_info_visible')}
              >
                <HoverCardTrigger asChild>
                  <GitCommit className="h-full w-full rotate-90 p-2" />
                </HoverCardTrigger>
              </PopoverButton>
              <PopoverButton
                sideOffset={90}
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                onClick={onClick}
                setting={ForkOptions.INCLUDE_BRANCHES}
                hoverTitle={
                  <>
                    <GitBranchPlus className="h-4 w-4 rotate-180" />
                    {localize(optionLabels[ForkOptions.INCLUDE_BRANCHES] as TranslationKeys)}
                  </>
                }
                hoverDescription={localize('com_ui_fork_info_branches')}
              >
                <HoverCardTrigger asChild>
                  <GitBranchPlus className="h-full w-full rotate-180 p-2" />
                </HoverCardTrigger>
              </PopoverButton>
              <PopoverButton
                sideOffset={25}
                setActiveSetting={setActiveSetting}
                timeoutRef={timeoutRef}
                onClick={onClick}
                setting={ForkOptions.TARGET_LEVEL}
                hoverTitle={
                  <>
                    <ListTree className="h-5 w-5" />
                    {`${localize(optionLabels[ForkOptions.TARGET_LEVEL] as TranslationKeys)} (${localize(
                      'com_endpoint_default',
                    )})`}
                  </>
                }
                hoverDescription={localize('com_ui_fork_info_target')}
              >
                <HoverCardTrigger asChild>
                  <ListTree className="h-full w-full p-2" />
                </HoverCardTrigger>
              </PopoverButton>
            </div>
            <HoverCard openDelay={50}>
              <HoverCardTrigger asChild>
                <div className="flex h-6 w-full items-center justify-start text-sm dark:text-gray-300 dark:hover:text-gray-200">
                  <Checkbox
                    checked={splitAtTarget}
                    onCheckedChange={(checked: boolean) => setSplitAtTarget(checked)}
                    className="m-2 transition duration-300 ease-in-out"
                  />
                  {localize('com_ui_fork_split_target')}
                </div>
              </HoverCardTrigger>
              <OptionHover
                side={ESide.Right}
                description="com_ui_fork_info_start"
                langCode={true}
                sideOffset={20}
              />
            </HoverCard>
            <HoverCard openDelay={50}>
              <HoverCardTrigger asChild>
                <div className="flex h-6 w-full items-center justify-start text-sm dark:text-gray-300 dark:hover:text-gray-200">
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
                  {localize('com_ui_fork_remember')}
                </div>
              </HoverCardTrigger>
              <OptionHover
                side={ESide.Right}
                description="com_ui_fork_info_remember"
                langCode={true}
                sideOffset={20}
              />
            </HoverCard>
          </Popover.Content>
        </div>
      </Popover.Portal>
    </Popover.Root>
  );
}
