'use client';

import * as React from 'react';

// import { NumericFormat } from 'react-number-format';

import RCInputNumber from 'rc-input-number';
import * as InputNumberPrimitive from 'rc-input-number';
import { cn } from '~/utils';

// TODO help needed
// React.ElementRef<typeof LabelPrimitive.Root>,
// React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>

const InputNumber = React.forwardRef<
  React.ElementRef<typeof RCInputNumber>,
  InputNumberPrimitive.InputNumberProps
>(({ className, ...props }, ref) => {
  return (
    <RCInputNumber
      className={cn(
        'flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-50 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
InputNumber.displayName = 'Input';

// console.log(_InputNumber);

// const InputNumber = React.forwardRef(({ className, ...props }, ref) => {
//   return (
//     <NumericFormat
//       className={cn(
//         'flex h-10 w-full rounded-md border border-slate-300 bg-transparent py-2 px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-50 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900',
//         className
//       )}
//       ref={ref}
//       {...props}
//     />
//   );
// });

export { InputNumber };
