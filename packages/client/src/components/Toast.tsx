import * as RadixToast from '@radix-ui/react-toast';
import { NotificationSeverity } from '~/common';
import { useToast } from '~/hooks';

export function Toast() {
  const { toast, onOpenChange } = useToast();
  const severityClassName = {
    /* Going up by 100 units in terms of darkness (eg bg-green-500 to bg-green-600) for
     * bg colors produces colors that are too visually dissimilar to LibreChat's standard color palette.
     * These colors were derived by adjusting the values in the HSV color space using CCA
     * until the 4.5:1 contrast ratio threshold was met against white text while maintaining
     * a relatively recognizable color scheme for toasts without compromising accessibility.
     * */
    [NotificationSeverity.INFO]: 'border-gray-500 bg-gray-500',
    [NotificationSeverity.SUCCESS]: 'border-[#02855E] bg-[#02855E]',
    [NotificationSeverity.WARNING]: 'border-[#C75209] bg-[#C75209]',
    [NotificationSeverity.ERROR]: 'border-[#E02F1F] bg-[#E02F1F]',
  };

  return (
    <RadixToast.Root
      open={toast.open}
      onOpenChange={onOpenChange}
      className="toast-root"
      style={{
        height: '74px',
        marginBottom: '0px',
      }}
    >
      <div className="w-full p-1 text-center md:w-auto md:text-justify">
        <div
          className={`alert-root pointer-events-auto inline-flex flex-row gap-2 rounded-md border px-3 py-2 font-bold text-white ${
            severityClassName[toast.severity]
          }`}
        >
          {toast.showIcon && (
            <div className="mt-1 flex-shrink-0 flex-grow-0">
              <svg
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="icon-sm"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          )}
          <RadixToast.Description className="flex-1 justify-center gap-2">
            <div className="whitespace-pre-wrap text-left">{toast.message}</div>
          </RadixToast.Description>
        </div>
      </div>
    </RadixToast.Root>
  );
}
