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
};

const DialogTemplate = forwardRef((props: DialogTemplateProps, ref: Ref<HTMLDivElement>) => {
  const { title, description, main, buttons, leftButtons, selection, className } = props;
  const { selectHandler, selectClasses, selectText } = selection || {};

  const defaultSelect =
    'bg-gray-900 text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900';
  return (
    <DialogContent ref={ref} className={cn('shadow-2xl dark:bg-gray-900', className || '')}>
      <DialogHeader>
        <DialogTitle className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-200">{title}</DialogTitle>
        {description && (
          <DialogDescription className="text-gray-600 dark:text-gray-300">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>
      <div className="px-6">{main ? main : null}</div>
      <DialogFooter>
        <div>{leftButtons ? leftButtons : null}</div>
        <div className="flex gap-2">
          <DialogClose className="dark:hover:gray-400 border-gray-700">Cancel</DialogClose>
          {buttons ? buttons : null}
          {selection ? (
            <DialogClose
              onClick={selectHandler}
              className={`${
                selectClasses || defaultSelect
              } inline-flex h-10 items-center justify-center rounded-md border-none px-4 py-2 text-sm font-semibold`}
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
