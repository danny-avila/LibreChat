import React, { useRef, Dispatch, SetStateAction } from 'react';
import { TConversationTag, TConversation } from 'librechat-data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useConversationTagMutation } from '~/data-provider';
import { OGDialog, OGDialogClose } from '~/components/ui';
import { Spinner } from '~/components/svg';
import BookmarkForm from './BookmarkForm';
import { useLocalize } from '~/hooks';

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
  const formRef = useRef<HTMLFormElement>(null);
  const mutation = useConversationTagMutation(bookmark?.tag);

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
            mutation={mutation}
            conversation={conversation}
            onOpenChange={setOpen}
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
              disabled={mutation.isLoading}
              onClick={handleSubmitForm}
              className="btn rounded bg-green-500 font-bold text-white transition-all hover:bg-green-600"
            >
              {mutation.isLoading ? <Spinner /> : localize('com_ui_save')}
            </button>
          </OGDialogClose>
        }
      />
    </OGDialog>
  );
};

export default BookmarkEditDialog;
