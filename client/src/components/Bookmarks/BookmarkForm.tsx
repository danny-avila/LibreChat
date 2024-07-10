import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { TConversationTag } from 'librechat-data-provider';
import { cn, removeFocusOutlines, defaultTextProps } from '~/utils/';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import { useConversationTagMutation } from '~/data-provider';
import { Label, TextareaAutosize } from '~/components/ui/';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';

type TBookmarkFormProps = {
  bookmark?: TConversationTag;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  formRef: React.RefObject<HTMLFormElement>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
};
const BookmarkForm = ({ bookmark, onOpenChange, formRef, setIsLoading }: TBookmarkFormProps) => {
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const mutation = useConversationTagMutation(bookmark?.tag);
  const { bookmarks } = useBookmarkContext();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<TConversationTag>({
    defaultValues: {
      tag: bookmark?.tag || '',
      description: bookmark?.description || '',
    },
  });

  useEffect(() => {
    if (bookmark) {
      setValue('tag', bookmark.tag || '');
      setValue('description', bookmark.description || '');
    }
  }, [bookmark, setValue]);

  const onSubmit = (data: TConversationTag) => {
    if (mutation.isLoading) {
      return;
    }
    if (data.tag === bookmark?.tag && data.description === bookmark?.description) {
      return;
    }

    setIsLoading(true);
    mutation.mutate(data, {
      onSuccess: () => {
        showToast({
          message: bookmark
            ? localize('com_ui_bookmarks_update_success')
            : localize('com_ui_bookmarks_create_success'),
        });
        setIsLoading(false);
        onOpenChange(false);
      },
      onError: () => {
        showToast({
          message: bookmark
            ? localize('com_ui_bookmarks_update_error')
            : localize('com_ui_bookmarks_create_error'),
          severity: NotificationSeverity.ERROR,
        });
        setIsLoading(false);
      },
    });
  };

  return (
    <form
      ref={formRef}
      className="mt-6"
      aria-label="Bookmark form"
      method="POST"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="flex w-full flex-col items-center gap-2">
        <div className="grid w-full items-center gap-2">
          <Label htmlFor="bookmark-tag" className="text-left text-sm font-medium">
            {localize('com_ui_bookmarks_tag')}
          </Label>
          <input
            type="text"
            id="bookmark-tag"
            aria-label="Bookmark"
            {...register('tag', {
              required: 'tag is required',
              maxLength: {
                value: 128,
                message: localize('com_auth_password_max_length'),
              },
              validate: (value) => {
                return (
                  value === bookmark?.tag ||
                  bookmarks.every((bookmark) => bookmark.tag !== value) ||
                  'tag must be unique'
                );
              },
            })}
            aria-invalid={!!errors.tag}
            className={cn(
              defaultTextProps,
              'flex h-10 max-h-10 w-full resize-none border-gray-100 px-3 py-2 dark:border-gray-600',
              removeFocusOutlines,
            )}
            placeholder=" "
          />
          {errors.tag && <span className="text-sm text-red-500">{errors.tag.message}</span>}
        </div>

        <div className="grid w-full items-center gap-2">
          <Label htmlFor="bookmark-description" className="text-left text-sm font-medium">
            {localize('com_ui_bookmarks_description')}
          </Label>
          <TextareaAutosize
            {...register('description', {
              maxLength: {
                value: 1048,
                message: 'Maximum 1048 characters',
              },
            })}
            id="bookmark-description"
            disabled={false}
            className={cn(
              defaultTextProps,
              'flex max-h-[138px] min-h-[100px] w-full resize-none px-3 py-2',
            )}
          />
        </div>
      </div>
    </form>
  );
};

export default BookmarkForm;
