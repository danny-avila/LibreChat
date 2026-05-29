import { OGDialog, DialogTemplate, useToastContext } from '@librechat/client';
import { useAcceptSecondTermsMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const ImportantNoticeModal = ({
  open,
  onOpenChange,
  onAccept,
  onDecline,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const acceptSecondTermsMutation = useAcceptSecondTermsMutation({
    onSuccess: () => {
      onAccept();
      onOpenChange(false);
    },
    onError: () => {
      showToast({ message: 'Failed to accept notice' });
    },
  });

  const handleAccept = () => {
    acceptSecondTermsMutation.mutate();
  };

  const handleDecline = () => {
    onDecline();
    onOpenChange(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (open && !isOpen) {
      return;
    }
    onOpenChange(isOpen);
  };

  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <DialogTemplate
        title=""
        headerClassName="hidden"
        className="w-11/12 max-w-3xl sm:w-3/4 md:w-1/2 lg:w-2/5"
        showCloseButton={false}
        showCancelButton={false}
        main={
          <section tabIndex={0} className="max-h-[60vh] overflow-y-auto p-4">
            <div className="prose dark:prose-invert w-full max-w-none !text-text-primary">
              {/* Icon */}
              <div className="mb-2 flex justify-center text-red-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-24 w-24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {/* Heading */}
              <h2 className="!mt-0 mb-1 text-center text-2xl font-bold text-red-600">
                {localize('com_ui_important_notice').replace(/\s*\(.*\)$/, '')}
              </h2>
              <p className="mb-4 text-center text-sm !text-text-secondary">
                {localize('com_ui_important_notice').match(/\((.*)\)/)?.[0] || ''}
              </p>

              <hr />

              <p>{localize('com_ui_important_notice_p1')}</p>
              <p>{localize('com_ui_important_notice_p2')}</p>
              <p>{localize('com_ui_important_notice_p3')}</p>
              <p>{localize('com_ui_important_notice_p4')}</p>
              <p>
                <strong>{localize('com_ui_important_notice_p5')}</strong>
              </p>
              <p>{localize('com_ui_important_notice_p6')}</p>
            </div>
          </section>
        }
        buttons={
          <>
            <button
              onClick={handleDecline}
              className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {localize('com_ui_important_notice_decline')}
            </button>
            <button
              onClick={handleAccept}
              disabled={acceptSecondTermsMutation.isLoading}
              className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
            >
              {localize('com_ui_important_notice_agree')}
            </button>
          </>
        }
      />
    </OGDialog>
  );
};

export default ImportantNoticeModal;
