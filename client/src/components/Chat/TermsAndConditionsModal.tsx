import React from 'react';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useAcceptTermsMutation } from '~/data-provider';
import { OGDialog, Button, Spinner } from '~/components';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

interface TermsModalProps {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
  title?: string;
  modalContent?: string;
}

const TermsAndConditionsModal = ({
  open,
  onOpenChange,
  onAccept,
  onDecline,
  title,
  modalContent,
}: TermsModalProps) => {
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

  const isLoading = acceptTermsMutation.isLoading;

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
      <OGDialogTemplate
        title={title ?? localize('com_ui_terms_and_conditions')}
        className="w-11/12 max-w-3xl sm:w-3/4 md:w-1/2 lg:w-2/5"
        showCloseButton={false}
        showCancelButton={false}
        main={
          <section
            tabIndex={0}
            className="max-h-[60vh] overflow-y-auto p-4"
            aria-label={localize('com_ui_terms_and_conditions')}
          >
            <div className="prose dark:prose-invert w-full max-w-none text-text-primary">
              {modalContent ? (
                <MarkdownLite content={modalContent} />
              ) : (
                <p>{localize('com_ui_no_terms_content')}</p>
              )}
            </div>
          </section>
        }
        buttons={
          <>
            <Button onClick={handleDecline} variant="destructive" disabled={isLoading}>
              {localize('com_ui_decline')}
            </Button>
            <Button onClick={handleAccept} variant="submit" disabled={isLoading}>
              {isLoading ? <Spinner /> : localize('com_ui_accept')}
            </Button>
          </>
        }
      />
    </OGDialog>
  );
};

export default TermsAndConditionsModal;
