import React, { useRef, useState, Dispatch, SetStateAction } from 'react';
import { TConversationTag, TConversation } from 'librechat-data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { OGDialog, OGDialogClose } from '~/components/ui/';
import BookmarkForm from './BookmarkForm';
import { useLocalize } from '~/hooks';
import { Spinner } from '../svg';

type BookmarkEditDialogProps = {
  bookmark?: TConversationTag;
  conversation?: TConversation;
  tags?: string[];
  setTags?: (tags: string[]) => void;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

const BookmarkEditDialog = ({
  bookmark,
  conversation,
  tags,
  setTags,
  open,
  setOpen,
}: BookmarkEditDialogProps) => {
  const localize = useLocalize();
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmitForm = () => {
    if (formRef.current) {
      formRef.current.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  };

  return (
    <OGDialog open={open} onOpenChange={setOpen}>
      <OGDialogTemplate
        title="Bookmark"
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
          <OGDialogClose asChild>
            <button
              type="submit"
              disabled={isLoading}
              onClick={handleSubmitForm}
              className="btn rounded bg-green-500 font-bold text-white transition-all hover:bg-green-600"
            >
              {isLoading ? <Spinner /> : localize('com_ui_save')}
            </button>
          </OGDialogClose>
        }
      />
    </OGDialog>
  );
};

export default BookmarkEditDialog;
