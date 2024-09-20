import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useAcceptTermsMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { OGDialog } from '~/components/ui';
import { useLocalize } from '~/hooks';

const TermsAndConditionsModal = ({
  open,
  onOpenChange,
  onAccept,
  onDecline,
  title,
  modalContent,
}: {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
  title?: string;
  contentUrl?: string;
  modalContent?: string;
}) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const acceptTermsMutation = useAcceptTermsMutation({
    onSuccess: () => {
      onAccept();
      onOpenChange(false);
    },
    onError: () => {
      showToast({ message: 'Failed to accept terms' });
    },
  });

  const handleAccept = () => {
    acceptTermsMutation.mutate();
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
        title={title ?? localize('com_ui_terms_and_conditions')}
        className="w-11/12 max-w-3xl sm:w-3/4 md:w-1/2 lg:w-2/5"
        showCloseButton={false}
        showCancelButton={false}
        main={
          <div className="max-h-[60vh] overflow-y-auto p-4">
            <div className="prose dark:prose-invert w-full max-w-none !text-text-primary">
              {modalContent != null && modalContent ? (
                <MarkdownLite content={modalContent} />
              ) : (
                <p>{localize('com_ui_no_terms_content')}</p>
              )}
            </div>
          </div>
        }
        buttons={
          <>
            <button
              onClick={handleDecline}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-surface-active"
            >
              {localize('com_ui_decline')}
            </button>
            <button
              onClick={handleAccept}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border-heavy bg-surface-secondary px-4 py-2 text-sm text-text-primary hover:bg-green-500 hover:text-white focus:bg-green-500 focus:text-white dark:hover:bg-green-600 dark:focus:bg-green-600"
            >
              {localize('com_ui_accept')}
            </button>
          </>
        }
      />
    </OGDialog>
  );
};

export default TermsAndConditionsModal;
