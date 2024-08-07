import { ReactElement } from 'react';
import {
  OGDialog,
  OGDialogTrigger,
  Label,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { CrossIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

export default function TooltipIcon({
  disabled,
  appendLabel = false,
  title,
  className = '',
  confirm,
  confirmMessage,
  icon,
  tabIndex,
  onFocus,
  onBlur,
}: {
  disabled: boolean;
  title: string;
  appendLabel?: boolean;
  className?: string;
  confirm?: () => void;
  confirmMessage?: ReactElement;
  icon?: ReactElement;
  tabIndex?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const localize = useLocalize();

  const renderDeleteButton = () => {
    if (appendLabel) {
      return (
        <>
          {icon} {localize('com_ui_delete')}
        </>
      );
    }
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{icon}</span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={0}>
            {localize('com_ui_delete')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (!confirmMessage) {
    return (
      <button
        className={className}
        onClick={confirm}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {disabled ? <CrossIcon /> : renderDeleteButton()}
      </button>
    );
  }
  return (
    <OGDialog>
      <OGDialogTrigger asChild>
        <button className={className} tabIndex={tabIndex} onFocus={onFocus} onBlur={onBlur}>
          {disabled ? <CrossIcon /> : renderDeleteButton()}
        </button>
      </OGDialogTrigger>
      <OGDialogTemplate
        showCloseButton={false}
        title={title}
        className="max-w-[450px]"
        main={<Label className="text-left text-sm font-medium">{confirmMessage}</Label>}
        selection={{
          selectHandler: confirm,
          selectClasses:
            'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
          selectText: localize('com_ui_delete'),
        }}
      />
    </OGDialog>
  );
}
