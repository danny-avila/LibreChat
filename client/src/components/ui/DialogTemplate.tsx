import { forwardRef, ReactNode, Ref } from 'react';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './';
import { cn } from '~/utils/';
import { useLocalize } from '~/hooks';

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
  footerClassName?: string;
  showCloseButton?: boolean;
  showCancelButton?: boolean;
};

const DialogTemplate = forwardRef((props: DialogTemplateProps, ref: Ref<HTMLDivElement>) => {
  const localize = useLocalize();
  const {
    title,
    description,
    main,
    buttons,
    leftButtons,
    selection,
    className,
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
    <DialogContent
      showCloseButton={showCloseButton}
      ref={ref}
      className={cn('shadow-2xl dark:bg-gray-700', className || '')}
      onClick={(e) => e.stopPropagation()}
    >
      <DialogHeader className={cn(headerClassName ?? '')}>
        <DialogTitle className="text-lg font-medium leading-6 text-gray-800 dark:text-gray-200">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-gray-600 dark:text-gray-300">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>
      <div className="px-6">{main ? main : null}</div>
      <DialogFooter className={footerClassName}>
        <div>{leftButtons ? leftButtons : null}</div>
        <div className="flex h-auto gap-3">
          {showCancelButton && (
            <DialogClose className="border-gray-100 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-600">
              {Cancel}
            </DialogClose>
          )}
          {buttons ? buttons : null}
          {selection ? (
            <DialogClose
              onClick={selectHandler}
              className={`${
                selectClasses || defaultSelect
              } inline-flex h-10 items-center justify-center rounded-lg border-none px-4 py-2 text-sm`}
            >
              {selectText}
            </DialogClose>
          ) : null}
        </div>
      </DialogFooter>
    </DialogContent>
  );
});

export default DialogTemplate;
