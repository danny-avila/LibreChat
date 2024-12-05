import React, { useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { Controller, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import type {
  TConversation,
  TConversationTag,
  TConversationTagRequest,
} from 'librechat-data-provider';
import { Checkbox, Label, TextareaAutosize, Input } from '~/components';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import { useConversationTagMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn, logger } from '~/utils';

type TBookmarkFormProps = {
  tags?: string[];
  bookmark?: TConversationTag;
  conversation?: TConversation;
  formRef: React.RefObject<HTMLFormElement>;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mutation: ReturnType<typeof useConversationTagMutation>;
};
const BookmarkForm = ({
  tags,
  bookmark,
  mutation,
  conversation,
  setOpen,
  formRef,
}: TBookmarkFormProps) => {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { bookmarks } = useBookmarkContext();

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<TConversationTagRequest>({
    defaultValues: {
      tag: bookmark?.tag ?? '',
      description: bookmark?.description ?? '',
      conversationId: conversation?.conversationId ?? '',
      addToConversation: conversation ? true : false,
    },
  });

  useEffect(() => {
    if (bookmark && bookmark.tag) {
      setValue('tag', bookmark.tag);
      setValue('description', bookmark.description ?? '');
    }
  }, [bookmark, setValue]);

  const onSubmit = (data: TConversationTagRequest) => {
    logger.log('tag_mutation', 'BookmarkForm - onSubmit: data', data);
    if (mutation.isLoading) {
      return;
    }
    if (data.tag === bookmark?.tag && data.description === bookmark?.description) {
      return;
    }
    if (data.tag != null && (tags ?? []).includes(data.tag)) {
      showToast({
        message: localize('com_ui_bookmarks_create_exists'),
        status: 'warning',
      });
      return;
    }
    const allTags =
      queryClient.getQueryData<TConversationTag[]>([QueryKeys.conversationTags]) ?? [];
    if (allTags.some((tag) => tag.tag === data.tag)) {
      showToast({
        message: localize('com_ui_bookmarks_create_exists'),
        status: 'warning',
      });
      return;
    }

    mutation.mutate(data);
    setOpen(false);
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
          <Input
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
            placeholder="Bookmark"
          />
          {errors.tag && <span className="text-sm text-red-500">{errors.tag.message}</span>}
        </div>

        <div className="mt-4 grid w-full items-center gap-2">
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
              'flex h-10 max-h-[250px] min-h-[100px] w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm ring-offset-background focus-visible:outline-none',
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
              type="button"
              aria-label={localize('com_ui_bookmarks_add_to_conversation')}
              className="form-check-label w-full cursor-pointer text-text-primary"
              onClick={() =>
                setValue('addToConversation', !(getValues('addToConversation') ?? false), {
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
