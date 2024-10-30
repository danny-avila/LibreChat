import React, { useRef, Dispatch, SetStateAction } from 'react';
import { TConversationTag, TConversation } from 'librechat-data-provider';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useConversationTagMutation } from '~/data-provider';
import { OGDialog, Button, Spinner } from '~/components';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import BookmarkForm from './BookmarkForm';
import { useLocalize } from '~/hooks';
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
        className="w-11/12 md:max-w-2xl"
        main={
          <BookmarkForm
            tags={tags}
            setOpen={setOpen}
            mutation={mutation}
            conversation={conversation}
            bookmark={bookmark}
            formRef={formRef}
          />
        }
        buttons={
          <Button
            variant="submit"
            type="submit"
            disabled={mutation.isLoading}
            onClick={handleSubmitForm}
          >
            {mutation.isLoading ? <Spinner /> : localize('com_ui_save')}
          </Button>
        }
      />
    </OGDialog>
  );
};

export default BookmarkEditDialog;
