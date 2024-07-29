import React, { useRef, useState } from 'react';
import { DialogTrigger } from '@radix-ui/react-dialog';
import { TConversationTag, TConversation } from 'librechat-data-provider';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { Dialog, DialogButton } from '~/components/ui/';
import BookmarkForm from './BookmarkForm';
import { useLocalize } from '~/hooks';
import { Spinner } from '../svg';

type BookmarkEditDialogProps = {
  bookmark?: TConversationTag;
  conversation?: TConversation;
  tags?: string[];
  setTags?: (tags: string[]) => void;
  trigger: React.ReactNode;
};
const BookmarkEditDialog = ({
  bookmark,
  conversation,
  tags,
  setTags,
  trigger,
}: BookmarkEditDialogProps) => {
  const localize = useLocalize();
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmitForm = () => {
    if (formRef.current) {
      formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogTemplate
        title="Bookmark"
        className="w-11/12 sm:w-1/4"
        showCloseButton={false}
        main={
          <BookmarkForm
            conversation={conversation}
            onOpenChange={setOpen}
            setIsLoading={setIsLoading}
            bookmark={bookmark}
            formRef={formRef}
            setTags={setTags}
            tags={tags}
          />
        }
        buttons={
          <div className="mb-6 md:mb-2">
            <DialogButton
              disabled={isLoading}
              onClick={handleSubmitForm}
              className="bg-green-500 text-white hover:bg-green-600 dark:hover:bg-green-600"
            >
              {isLoading ? <Spinner /> : localize('com_ui_save')}
            </DialogButton>
          </div>
        }
      />
    </Dialog>
  );
};

export default BookmarkEditDialog;
