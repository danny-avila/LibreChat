/* eslint-disable */
import * as React from 'react';
import TextareaAutosize from 'react-textarea-autosize';

import { cn } from '../../utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex h-20 w-full resize-none rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-50 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
