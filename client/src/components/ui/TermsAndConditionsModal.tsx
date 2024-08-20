import { useLocalize } from '~/hooks';
import { Dialog } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { useAuthContext } from '~/hooks';
import Markdown from '~/components/Chat/Messages/Content/Markdown';

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
  const { token } = useAuthContext();

  const handleAccept = async () => {
    try {
      const response = await fetch('/api/user/terms/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        onAccept();
        onOpenChange(false);
      } else {
        const errorData = await response.json();
        console.error('Failed to accept terms:', errorData.message);
      }
    } catch (error) {
      console.error('Error accepting terms:', error);
    }
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTemplate
        title={title ?? localize('com_ui_terms_and_conditions')}
        className="w-11/12 max-w-3xl sm:w-3/4 md:w-1/2 lg:w-2/5"
        showCloseButton={false}
        showCancelButton={false}
        main={
          <div className="max-h-[60vh] overflow-y-auto p-4">
            <div className="prose dark:prose-invert w-full max-w-none !text-black dark:!text-white">
              {modalContent ? (
                <Markdown content={modalContent} isLatestMessage={false} />
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
              className="inline-flex h-10 items-center justify-center rounded-lg border-none bg-gray-500 px-4 py-2 text-sm text-white hover:bg-gray-600 dark:hover:bg-gray-600"
            >
              {localize('com_ui_decline')}
            </button>
            <button
              onClick={handleAccept}
              className="inline-flex h-10 items-center justify-center rounded-lg border-none bg-green-500 px-4 py-2 text-sm text-white hover:bg-green-600 dark:hover:bg-green-600"
            >
              {localize('com_ui_accept')}
            </button>
          </>
        }
      />
    </Dialog>
  );
};

export default TermsAndConditionsModal;
