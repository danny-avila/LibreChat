import { forwardRef, ReactNode, Ref } from 'react';
import {
  OGDialogTitle,
  OGDialogClose,
  OGDialogFooter,
  OGDialogHeader,
  OGDialogContent,
  OGDialogDescription,
} from './';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils/';

type SelectionProps = {
  selectHandler?: () => void;
  selectClasses?: string;
  selectText?: string;
};

type DialogTemplateProps = {
  title: string;
  description?: string;
  main?: ReactNode;
  buttons?: ReactNode;
  leftButtons?: ReactNode;
  selection?: SelectionProps;
  className?: string;
  headerClassName?: string;
  mainClassName?: string;
  footerClassName?: string;
  showCloseButton?: boolean;
  showCancelButton?: boolean;
};

const OGDialogTemplate = forwardRef((props: DialogTemplateProps, ref: Ref<HTMLDivElement>) => {
  const localize = useLocalize();
  const {
    title,
    main,
    buttons,
    selection,
    className,
    leftButtons,
    description,
    mainClassName,
    headerClassName,
    footerClassName,
    showCloseButton,
    showCancelButton = true,
  } = props;
  const { selectHandler, selectClasses, selectText } = selection || {};
  const Cancel = localize('com_ui_cancel');

  const defaultSelect =
    'bg-gray-800 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-200 dark:text-gray-800 dark:hover:bg-gray-200';
  return (
    <OGDialogContent
      showCloseButton={showCloseButton}
      ref={ref}
      className={cn(
        'bg-white dark:border-gray-700 dark:bg-gray-850 dark:text-gray-300',
        className || '',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <OGDialogHeader className={cn(headerClassName ?? '')}>
        <OGDialogTitle>{title}</OGDialogTitle>
        {description && <OGDialogDescription className="">{description}</OGDialogDescription>}
      </OGDialogHeader>
      <div className={cn('px-0', mainClassName)}>{main ? main : null}</div>
      <OGDialogFooter className={footerClassName}>
        <div>{leftButtons ? leftButtons : null}</div>
        <div className="flex h-auto gap-3">
          {showCancelButton && (
            <OGDialogClose className="btn btn-neutral border-token-border-light relative rounded-lg text-sm ring-offset-2 dark:ring-offset-0 focus:ring-2 focus:ring-black">
              {Cancel}
            </OGDialogClose>
          )}
          {buttons ? buttons : null}
          {selection ? (
            <OGDialogClose
              onClick={selectHandler}
              className={`${
                selectClasses || defaultSelect
              } inline-flex h-10 items-center justify-center rounded-lg border-none px-4 py-2 text-sm`}
            >
              {selectText}
            </OGDialogClose>
          ) : null}
        </div>
      </OGDialogFooter>
    </OGDialogContent>
  );
});

export default OGDialogTemplate;
