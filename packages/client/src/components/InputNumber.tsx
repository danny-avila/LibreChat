import * as React from 'react';

// import { NumericFormat } from 'react-number-format';

import RCInputNumber from 'rc-input-number';
import type { InputNumberProps } from 'rc-input-number';
import { cn } from '~/utils';

// Type for InputNumber component with explicit annotation to avoid pnpm inference issues
type InputNumberComponent = React.ForwardRefExoticComponent<
  InputNumberProps & React.RefAttributes<HTMLInputElement>
>;

const InputNumber: InputNumberComponent = React.forwardRef<
  HTMLInputElement,
  InputNumberProps
>(({ className, ...props }, ref) => {
  return (
    <RCInputNumber
      className={cn(
        'flex max-h-5 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-50',
        className ?? '',
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
//         'flex h-10 w-full rounded-md border border-gray-300 bg-transparent py-2 px-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-50 dark:focus:ring-gray-400 dark:focus:ring-offset-gray-900',
//         className
//       )}
//       ref={ref}
//       {...props}
//     />
//   );
// });

export { InputNumber };
