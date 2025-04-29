import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { GitFork, InfoIcon } from 'lucide-react';
import { ForkOptions } from 'librechat-data-provider';
import { GitCommit, GitBranchPlus, ListTree } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { VisuallyHidden } from '@ariakit/react';
import { TranslationKeys, useLocalize, useNavigateToConvo } from '~/hooks';
import { Checkbox } from '~/components/ui';
import { useForkConvoMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

interface PopoverButtonProps {
  children: React.ReactNode;
  setting: ForkOptions;
  onClick: (setting: ForkOptions) => void;
  setActiveSetting: React.Dispatch<React.SetStateAction<TranslationKeys>>;
  sideOffset?: number;
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  hoverInfo?: React.ReactNode | string;
  hoverTitle?: React.ReactNode | string;
  hoverDescription?: React.ReactNode | string;
  label: string;
}

const optionLabels: Record<ForkOptions, TranslationKeys> = {
  [ForkOptions.DIRECT_PATH]: 'com_ui_fork_visible',
  [ForkOptions.INCLUDE_BRANCHES]: 'com_ui_fork_branches',
  [ForkOptions.TARGET_LEVEL]: 'com_ui_fork_all_target',
  [ForkOptions.DEFAULT]: 'com_ui_fork_from_message',
};

const chevronDown = (
  <svg width="1em" height="1em" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
    />
  </svg>
);

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
  label,
}) => {
  return (
    <Ariakit.HovercardProvider>
      <div className="flex flex-col items-center">
        <Ariakit.HovercardAnchor
          render={
            <Ariakit.Button
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
                  setActiveSetting(optionLabels[ForkOptions.DEFAULT]);
                }, 175);
              }}
              className="mx-1 max-w-14 flex-1 rounded-lg border-2 bg-white text-gray-700 transition duration-300 ease-in-out hover:bg-gray-200 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-100"
              aria-label={label}
            >
              {children}
              <VisuallyHidden>{label}</VisuallyHidden>
            </Ariakit.Button>
          }
        />
        <Ariakit.HovercardDisclosure className="text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md">
          <VisuallyHidden>
            More details about {label}
          </VisuallyHidden>
          {chevronDown}
        </Ariakit.HovercardDisclosure>
        {((hoverInfo != null && hoverInfo !== '') ||
          (hoverTitle != null && hoverTitle !== '') ||
          (hoverDescription != null && hoverDescription !== '')) && (
          <Ariakit.Hovercard
            gutter={16}
            className="z-[999] w-80 rounded-md border border-gray-200 bg-white p-4 shadow-md dark:border-gray-600 dark:bg-gray-700"
            portal={true}
          >
            <div className="space-y-2">
              <p className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
                {hoverInfo && hoverInfo}
                {hoverTitle && <span className="flex flex-wrap gap-1 font-bold">{hoverTitle}</span>}
                {hoverDescription && hoverDescription}
              </p>
            </div>
          </Ariakit.Hovercard>
        )}
      </div>
    </Ariakit.HovercardProvider>
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
  const popoverStore = Ariakit.usePopoverStore({
    placement: 'top',
  });
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
    <>
      <Ariakit.PopoverAnchor store={popoverStore}>
        <button
          className={cn(
            'hover-button active rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-500 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible',
            'data-[state=open]:active focus:opacity-100 data-[state=open]:bg-gray-100 data-[state=open]:text-gray-500 data-[state=open]:dark:bg-gray-700 data-[state=open]:dark:text-gray-200',
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
            } else {
              popoverStore.toggle();
            }
          }}
          type="button"
          aria-label={localize('com_ui_fork')}
        >
          <GitFork className="h-4 w-4 hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400" />
        </button>
      </Ariakit.PopoverAnchor>
      <Ariakit.Popover
        store={popoverStore}
        gutter={5}
        className="bg-token-surface-primary flex min-h-[120px] min-w-[215px] flex-col gap-3 overflow-hidden rounded-lg bg-white p-2 px-3 shadow-lg dark:bg-gray-700"
        style={{
          outline: 'none',
          pointerEvents: 'auto',
          boxSizing: 'border-box',
          zIndex: 999,
        }}
        portal={true}
      >
        <div className="flex h-6 w-full items-center justify-center text-sm dark:text-gray-200">
          {localize(activeSetting)}
          <Ariakit.HovercardProvider>
            <div className="ml-auto flex items-center">
              <Ariakit.HovercardAnchor
                render={
                  <button
                    className="flex h-4 w-4 gap-2 text-gray-500 dark:text-white/50"
                    aria-label="Fork information"
                  >
                    <InfoIcon />
                  </button>
                }
              />
              <Ariakit.HovercardDisclosure className="text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md">
                <VisuallyHidden>
                  More information about fork options
                </VisuallyHidden>
                {chevronDown}
              </Ariakit.HovercardDisclosure>
            </div>
            <Ariakit.Hovercard
              gutter={19}
              className="z-[999] w-80 rounded-md border border-gray-200 bg-white p-4 shadow-md dark:border-gray-600 dark:bg-gray-700"
              portal={true}
            >
              <div className="flex flex-col gap-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <span>{localize('com_ui_fork_info_1')}</span>
                <span>{localize('com_ui_fork_info_2')}</span>
                <span>
                  {localize('com_ui_fork_info_3', {
                    0: localize('com_ui_fork_split_target'),
                  })}
                </span>
              </div>
            </Ariakit.Hovercard>
          </Ariakit.HovercardProvider>
        </div>
        <div className="flex h-full w-full items-center justify-center gap-1">
          <PopoverButton
            sideOffset={155}
            setActiveSetting={setActiveSetting}
            timeoutRef={timeoutRef}
            onClick={onClick}
            setting={ForkOptions.DIRECT_PATH}
            label={localize(optionLabels[ForkOptions.DIRECT_PATH])}
            hoverTitle={
              <>
                <GitCommit className="h-5 w-5 rotate-90" />
                {localize(optionLabels[ForkOptions.DIRECT_PATH])}
              </>
            }
            hoverDescription={localize('com_ui_fork_info_visible')}
          >
            <GitCommit className="h-full w-full rotate-90 p-2" />
          </PopoverButton>
          <PopoverButton
            sideOffset={90}
            setActiveSetting={setActiveSetting}
            timeoutRef={timeoutRef}
            onClick={onClick}
            setting={ForkOptions.INCLUDE_BRANCHES}
            label={localize(optionLabels[ForkOptions.INCLUDE_BRANCHES])}
            hoverTitle={
              <>
                <GitBranchPlus className="h-4 w-4 rotate-180" />
                {localize(optionLabels[ForkOptions.INCLUDE_BRANCHES])}
              </>
            }
            hoverDescription={localize('com_ui_fork_info_branches')}
          >
            <GitBranchPlus className="h-full w-full rotate-180 p-2" />
          </PopoverButton>
          <PopoverButton
            sideOffset={25}
            setActiveSetting={setActiveSetting}
            timeoutRef={timeoutRef}
            onClick={onClick}
            setting={ForkOptions.TARGET_LEVEL}
            label={localize(optionLabels[ForkOptions.TARGET_LEVEL])}
            hoverTitle={
              <>
                <ListTree className="h-5 w-5" />
                {`${localize(
                  optionLabels[ForkOptions.TARGET_LEVEL],
                )} (${localize('com_endpoint_default')})`}
              </>
            }
            hoverDescription={localize('com_ui_fork_info_target')}
          >
            <ListTree className="h-full w-full p-2" />
          </PopoverButton>
        </div>
        <Ariakit.HovercardProvider>
          <div className="flex items-center">
            <Ariakit.HovercardAnchor
              render={
                <div className="flex h-6 w-full items-center justify-start text-sm dark:text-gray-300 dark:hover:text-gray-200">
                  <Ariakit.Checkbox
                    id="split-target-checkbox"
                    checked={splitAtTarget}
                    onChange={(event) => setSplitAtTarget(event.target.checked)}
                    className="m-2 h-4 w-4 rounded-sm border border-primary ring-offset-background transition duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    aria-label={localize('com_ui_fork_split_target')}
                  />
                  <label htmlFor="split-target-checkbox" className="ml-2 cursor-pointer">
                    {localize('com_ui_fork_split_target')}
                  </label>
                </div>
              }
            />
            <Ariakit.HovercardDisclosure className="text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md">
              <VisuallyHidden>
                More information about {localize('com_ui_fork_split_target')}
              </VisuallyHidden>
              {chevronDown}
            </Ariakit.HovercardDisclosure>
          </div>
          <Ariakit.Hovercard
            gutter={20}
            className="z-[999] w-80 rounded-md border border-gray-200 bg-white p-4 shadow-md dark:border-gray-600 dark:bg-gray-700"
            portal={true}
          >
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {localize('com_ui_fork_info_start')}
              </p>
            </div>
          </Ariakit.Hovercard>
        </Ariakit.HovercardProvider>
        <Ariakit.HovercardProvider>
          <div className="flex items-center">
            <Ariakit.HovercardAnchor
              render={
                <div className="flex h-6 w-full items-center justify-start text-sm dark:text-gray-300 dark:hover:text-gray-200">
                  <Ariakit.Checkbox
                    id="remember-checkbox"
                    checked={remember}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      if (checked) {
                        showToast({
                          message: localize('com_ui_fork_remember_checked'),
                          status: 'info',
                        });
                      }
                      setRemember(checked);
                    }}
                    className="m-2 h-4 w-4 rounded-sm border border-primary ring-offset-background transition duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                    aria-label={localize('com_ui_fork_remember')}
                  />
                  <label htmlFor="remember-checkbox" className="ml-2 cursor-pointer">
                    {localize('com_ui_fork_remember')}
                  </label>
                </div>
              }
            />
            <Ariakit.HovercardDisclosure className="text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md">
              <VisuallyHidden>
                More information about {localize('com_ui_fork_remember')}
              </VisuallyHidden>
              {chevronDown}
            </Ariakit.HovercardDisclosure>
          </div>
          <Ariakit.Hovercard
            gutter={20}
            className="z-[999] w-80 rounded-md border border-gray-200 bg-white p-4 shadow-md dark:border-gray-600 dark:bg-gray-700"
            portal={true}
          >
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {localize('com_ui_fork_info_remember')}
              </p>
            </div>
          </Ariakit.Hovercard>
        </Ariakit.HovercardProvider>
      </Ariakit.Popover>
    </>
  );
}
