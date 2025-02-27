import React from 'react';
import { cn } from '~/utils';

const MinimalMessages = React.forwardRef(
  (
    props: { children: React.ReactNode; className?: string },
    ref: React.ForwardedRef<HTMLDivElement>,
  ) => {
    return (
      <div
        className={cn(
          'relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800',
          props.className,
        )}
      >
        <div className="transition-width relative h-full w-full flex-1 overflow-auto bg-white dark:bg-gray-800">
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            <div className="flex-1 overflow-hidden overflow-y-auto">
              <div className="dark:gpt-dark-gray relative h-full">
                <div
                  ref={ref}
                  style={{
                    height: '100%',
                    overflowY: 'auto',
                    width: '100%',
                  }}
                >
                  <div className="flex flex-col pb-9 text-sm dark:bg-transparent">
                    {props.children}
                    <div className="dark:gpt-dark-gray group h-0 w-full shrink-0 dark:border-gray-800/50" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export default MinimalMessages;
