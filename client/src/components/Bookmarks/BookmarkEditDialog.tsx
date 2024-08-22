import React, { useRef, Dispatch, SetStateAction } from 'react';
import { TConversationTag, TConversation } from 'librechat-data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useConversationTagMutation } from '~/data-provider';
import { OGDialog, OGDialogClose } from '~/components/ui';
import { useLocalize, useBookmarkSuccess } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { Spinner } from '~/components/svg';
import BookmarkForm from './BookmarkForm';
import { logger } from '~/utils';

type BookmarkEditDialogProps = {
  context: string;
  bookmark?: TConversationTag;
  conversation?: TConversation;
  tags?: string[];
  setTags?: (tags: string[]) => void;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
};

const BookmarkEditDialog = ({
  context,
  bookmark,
  conversation,
  tags,
  setTags,
  open,
  setOpen,
}: BookmarkEditDialogProps) => {
  const localize = useLocalize();
  const formRef = useRef<HTMLFormElement>(null);
  const onSuccess = useBookmarkSuccess(conversation?.conversationId ?? '');

  const { showToast } = useToastContext();
  const mutation = useConversationTagMutation({
    context,
    tag: bookmark?.tag,
    options: {
      onSuccess: (_data, vars) => {
        showToast({
          message: bookmark
            ? localize('com_ui_bookmarks_update_success')
            : localize('com_ui_bookmarks_create_success'),
        });
        setOpen(false);
        logger.log('tag_mutation', 'tags before setting', tags);
        if (setTags && vars.addToConversation === true) {
          const newTags = [...(tags || []), vars.tag].filter(
            (tag) => tag !== undefined,
          ) as string[];
          setTags(newTags);
          onSuccess(newTags);
          logger.log('tag_mutation', 'tags after', newTags);
        }
      },
      onError: () => {
        showToast({
          message: bookmark
            ? localize('com_ui_bookmarks_update_error')
            : localize('com_ui_bookmarks_create_error'),
          severity: NotificationSeverity.ERROR,
        });
      },
    },
  });

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
            bookmark={bookmark}
            formRef={formRef}
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
