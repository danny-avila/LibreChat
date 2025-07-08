import React, { useState, useRef } from 'react';
import { useRecoilState } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { VisuallyHidden } from '@ariakit/react';
import { GitFork, InfoIcon } from 'lucide-react';
import { ForkOptions } from 'librechat-data-provider';
import { GitCommit, GitBranchPlus, ListTree } from 'lucide-react';
import { TranslationKeys, useLocalize, useNavigateToConvo } from '~/hooks';
import { useForkConvoMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

interface PopoverButtonProps {
  children: React.ReactNode;
  setting: ForkOptions;
  onClick: (setting: ForkOptions) => void;
  setActiveSetting: React.Dispatch<React.SetStateAction<TranslationKeys>>;
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
  timeoutRef,
  hoverInfo,
  hoverTitle,
  hoverDescription,
  label,
}) => {
  const localize = useLocalize();

  return (
    <Ariakit.HovercardProvider placement="right-start">
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
              className="mx-0.5 w-14 flex-1 rounded-xl border-2 border-border-medium bg-surface-secondary text-text-secondary transition duration-200 ease-in-out hover:bg-surface-hover hover:text-text-primary"
              aria-label={label}
            >
              {children}
              <VisuallyHidden>{label}</VisuallyHidden>
            </Ariakit.Button>
          }
        />
        <Ariakit.HovercardDisclosure className="rounded-full text-text-secondary focus:outline-none focus:ring-2 focus:ring-ring">
          <VisuallyHidden>
            {localize('com_ui_fork_more_details_about', { 0: label })}
          </VisuallyHidden>
          {chevronDown}
        </Ariakit.HovercardDisclosure>
        {((hoverInfo != null && hoverInfo !== '') ||
          (hoverTitle != null && hoverTitle !== '') ||
          (hoverDescription != null && hoverDescription !== '')) && (
          <Ariakit.Hovercard
            gutter={16}
            shift={40}
            flip={false}
            className="z-[999] w-80 rounded-2xl border border-border-medium bg-surface-secondary p-4 text-text-primary shadow-md"
            portal={true}
            unmountOnHide={true}
          >
            <div className="space-y-2">
              <p className="flex flex-col gap-2 text-sm text-text-secondary">
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

interface CheckboxOptionProps {
  id: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  labelKey: TranslationKeys;
  infoKey: TranslationKeys;
  showToastOnCheck?: boolean;
}
const CheckboxOption: React.FC<CheckboxOptionProps> = ({
  id,
  checked,
  onToggle,
  labelKey,
  infoKey,
  showToastOnCheck = false,
}) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  return (
    <Ariakit.HovercardProvider placement="right-start">
      <div className="flex items-center">
        <div className="flex h-6 w-full select-none items-center justify-start rounded-md text-sm text-text-secondary hover:text-text-primary">
          <Ariakit.HovercardAnchor
            render={
              <div>
                <Ariakit.Checkbox
                  id={id}
                  checked={checked}
                  onChange={(e) => {
                    const value = e.target.checked;
                    if (value && showToastOnCheck) {
                      showToast({
                        message: localize('com_ui_fork_remember_checked'),
                        status: 'info',
                      });
                    }
                    onToggle(value);
                  }}
                  className="h-4 w-4 rounded-sm border border-primary ring-offset-background transition duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  aria-label={localize(labelKey)}
                />
                <label htmlFor={id} className="ml-2 cursor-pointer">
                  {localize(labelKey)}
                </label>
              </div>
            }
          />
        </div>
        <Ariakit.HovercardDisclosure className="rounded-full text-text-secondary focus:outline-none focus:ring-2 focus:ring-ring">
          <VisuallyHidden>{localize(infoKey)}</VisuallyHidden>
          {chevronDown}
        </Ariakit.HovercardDisclosure>
      </div>
      <Ariakit.Hovercard
        gutter={14}
        shift={40}
        flip={false}
        className="z-[999] w-80 rounded-2xl border border-border-medium bg-surface-secondary p-4 text-text-primary shadow-md"
        portal={true}
        unmountOnHide={true}
      >
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">{localize(infoKey)}</p>
        </div>
      </Ariakit.Hovercard>
    </Ariakit.HovercardProvider>
  );
};

export default function Fork({
  messageId,
  conversationId: _convoId,
  forkingSupported = false,
  latestMessageId,
  isLast = false,
}: {
  messageId: string;
  conversationId: string | null;
  forkingSupported?: boolean;
  latestMessageId?: string;
  isLast?: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [remember, setRemember] = useState(false);
  const { navigateToConvo } = useNavigateToConvo();
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [forkSetting, setForkSetting] = useRecoilState(store.forkSetting);
  const [activeSetting, setActiveSetting] = useState(optionLabels.default);
  const [splitAtTarget, setSplitAtTarget] = useRecoilState(store.splitAtTarget);
  const [rememberGlobal, setRememberGlobal] = useRecoilState(store.rememberDefaultFork);
  const popoverStore = Ariakit.usePopoverStore({
    placement: 'bottom',
  });

  const buttonStyle = cn(
    'hover-button rounded-lg p-1.5 text-text-secondary-alt transition-colors duration-200',
    'hover:text-text-primary hover:bg-surface-hover',
    'md:group-hover:visible md:group-focus-within:visible md:group-[.final-completion]:visible',
    !isLast && 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
    'focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:outline-none',
    isActive && 'active text-text-primary bg-surface-hover',
  );

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
    onError: (error) => {
      /** Rate limit error (429 status code) */
      const isRateLimitError =
        (error as any)?.response?.status === 429 ||
        (error as any)?.status === 429 ||
        (error as any)?.statusCode === 429;

      showToast({
        message: isRateLimitError
          ? localize('com_ui_fork_error_rate_limit')
          : localize('com_ui_fork_error'),
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

  const forkOptionsConfig = [
    {
      setting: ForkOptions.DIRECT_PATH,
      label: localize(optionLabels[ForkOptions.DIRECT_PATH]),
      icon: <GitCommit className="h-full w-full rotate-90 p-2" />,
      hoverTitle: (
        <>
          <GitCommit className="h-5 w-5 rotate-90" />
          {localize(optionLabels[ForkOptions.DIRECT_PATH])}
        </>
      ),
      hoverDescription: localize('com_ui_fork_info_visible'),
    },
    {
      setting: ForkOptions.INCLUDE_BRANCHES,
      label: localize(optionLabels[ForkOptions.INCLUDE_BRANCHES]),
      icon: <GitBranchPlus className="h-full w-full rotate-180 p-2" />,
      hoverTitle: (
        <>
          <GitBranchPlus className="h-4 w-4 rotate-180" />
          {localize(optionLabels[ForkOptions.INCLUDE_BRANCHES])}
        </>
      ),
      hoverDescription: localize('com_ui_fork_info_branches'),
    },
    {
      setting: ForkOptions.TARGET_LEVEL,
      label: localize(optionLabels[ForkOptions.TARGET_LEVEL]),
      icon: <ListTree className="h-full w-full p-2" />,
      hoverTitle: (
        <>
          <ListTree className="h-5 w-5" />
          {`${localize(optionLabels[ForkOptions.TARGET_LEVEL])} (${localize('com_endpoint_default')})`}
        </>
      ),
      hoverDescription: localize('com_ui_fork_info_target'),
    },
  ];

  return (
    <>
      <Ariakit.PopoverAnchor
        store={popoverStore}
        render={
          <button
            className={buttonStyle}
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
                setIsActive(popoverStore.getState().open);
              }
            }}
            type="button"
            aria-label={localize('com_ui_fork')}
          >
            <GitFork size="19" />
          </button>
        }
      />
      <Ariakit.Popover
        store={popoverStore}
        gutter={10}
        className={`popover-animate ${isActive ? 'open' : ''} flex w-60 flex-col gap-3 overflow-hidden rounded-2xl border border-border-medium bg-surface-secondary p-2 px-4 shadow-lg`}
        style={{
          outline: 'none',
          pointerEvents: 'auto',
          zIndex: 50,
        }}
        portal={true}
        unmountOnHide={true}
        onClose={() => setIsActive(false)}
      >
        <div className="flex h-8 w-full items-center justify-center text-sm text-text-primary">
          {localize(activeSetting)}
          <Ariakit.HovercardProvider placement="right-start">
            <div className="ml-auto flex h-6 w-6 items-center justify-center gap-1">
              <Ariakit.HovercardAnchor
                render={
                  <button
                    className="flex h-5 w-5 cursor-help items-center rounded-full text-text-secondary"
                    aria-label={localize('com_ui_fork_info_button_label')}
                  >
                    <InfoIcon />
                  </button>
                }
              />
              <Ariakit.HovercardDisclosure className="rounded-full text-text-secondary focus:outline-none focus:ring-2 focus:ring-ring">
                <VisuallyHidden>{localize('com_ui_fork_more_info_options')}</VisuallyHidden>
                {chevronDown}
              </Ariakit.HovercardDisclosure>
            </div>
            <Ariakit.Hovercard
              gutter={19}
              shift={40}
              flip={false}
              className="z-[999] w-80 rounded-2xl border border-border-medium bg-surface-secondary p-4 text-text-primary shadow-md"
              portal={true}
              unmountOnHide={true}
            >
              <div className="flex flex-col gap-2 space-y-2 text-sm text-text-secondary">
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
          {forkOptionsConfig.map((opt) => (
            <PopoverButton
              key={opt.setting}
              setActiveSetting={setActiveSetting}
              timeoutRef={timeoutRef}
              onClick={onClick}
              setting={opt.setting}
              label={opt.label}
              hoverTitle={opt.hoverTitle}
              hoverDescription={opt.hoverDescription}
            >
              {opt.icon}
            </PopoverButton>
          ))}
        </div>
        <CheckboxOption
          id="split-target-checkbox"
          checked={splitAtTarget}
          onToggle={setSplitAtTarget}
          labelKey="com_ui_fork_split_target"
          infoKey="com_ui_fork_info_start"
        />
        <CheckboxOption
          id="remember-checkbox"
          checked={remember}
          onToggle={(checked) => {
            if (checked)
              showToast({ message: localize('com_ui_fork_remember_checked'), status: 'info' });
            setRemember(checked);
          }}
          labelKey="com_ui_fork_remember"
          infoKey="com_ui_fork_info_remember"
          showToastOnCheck
        />
      </Ariakit.Popover>
    </>
  );
}
