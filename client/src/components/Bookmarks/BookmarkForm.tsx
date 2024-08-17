import React, { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type {
  TConversationTag,
  TConversation,
  TConversationTagRequest,
} from 'librechat-data-provider';
import { cn, removeFocusOutlines, defaultTextProps } from '~/utils/';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import { useConversationTagMutation } from '~/data-provider';
import { Checkbox, Label, TextareaAutosize } from '~/components/ui/';
import { useLocalize, useBookmarkSuccess } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';

type TBookmarkFormProps = {
  bookmark?: TConversationTag;
  conversation?: TConversation;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  formRef: React.RefObject<HTMLFormElement>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  tags?: string[];
  setTags?: (tags: string[]) => void;
};
const BookmarkForm = ({
  bookmark,
  conversation,
  onOpenChange,
  formRef,
  setIsLoading,
  tags,
  setTags,
}: TBookmarkFormProps) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { bookmarks } = useBookmarkContext();
  const mutation = useConversationTagMutation(bookmark?.tag);
  const onSuccess = useBookmarkSuccess(conversation?.conversationId || '');

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<TConversationTagRequest>({
    defaultValues: {
      tag: bookmark?.tag || '',
      description: bookmark?.description || '',
      conversationId: conversation?.conversationId || '',
      addToConversation: conversation ? true : false,
    },
  });

  useEffect(() => {
    if (bookmark) {
      setValue('tag', bookmark.tag || '');
      setValue('description', bookmark.description || '');
    }
  }, [bookmark, setValue]);

  const onSubmit = (data: TConversationTagRequest) => {
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
        if (setTags && data.addToConversation) {
          const newTags = [...(tags || []), data.tag].filter(
            (tag) => tag !== undefined,
          ) as string[];
          setTags(newTags);
          onSuccess(newTags);
        }
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
            {localize('com_ui_bookmarks_title')}
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
              'flex h-10 max-h-10 w-full resize-none px-3 py-2',
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
        {conversation && (
          <div className="mt-2 flex w-full items-center">
            <Controller
              name="addToConversation"
              control={control}
              render={({ field }) => (
                <Checkbox
                  {...field}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                  value={field.value?.toString()}
                />
              )}
            />
            <button
              aria-label={localize('com_ui_bookmarks_add_to_conversation')}
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              onClick={() =>
                setValue('addToConversation', !getValues('addToConversation'), {
                  shouldDirty: true,
                })
              }
            >
              <div className="flex select-none items-center">
                {localize('com_ui_bookmarks_add_to_conversation')}
              </div>
            </button>
          </div>
        )}
      </div>
    </form>
  );
};

export default BookmarkForm;
