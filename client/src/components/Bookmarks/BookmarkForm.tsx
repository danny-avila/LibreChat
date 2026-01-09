import React, { useEffect } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { Controller, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Switch, Label, Input, useToastContext, Textarea } from '@librechat/client';
import type { TConversationTag, TConversationTagRequest } from 'librechat-data-provider';
import { useBookmarkContext } from '~/Providers/BookmarkContext';
import { useConversationTagMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn, logger } from '~/utils';

type TBookmarkFormProps = {
  tags?: string[];
  bookmark?: TConversationTag;
  conversationId?: string;
  formRef: React.RefObject<HTMLFormElement>;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  mutation: ReturnType<typeof useConversationTagMutation>;
};
const BookmarkForm = ({
  tags,
  bookmark,
  mutation,
  conversationId,
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
    control,
    formState: { errors },
  } = useForm<TConversationTagRequest>({
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      tag: bookmark?.tag ?? '',
      description: bookmark?.description ?? '',
      conversationId: conversationId ?? '',
      addToConversation: conversationId != null && conversationId ? true : false,
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
    if (allTags.some((tag) => tag.tag === data.tag && tag.tag !== bookmark?.tag)) {
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
    <form ref={formRef} aria-label="Bookmark form" method="POST" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-4">
        {/* Tag name input */}
        <div className="space-y-2">
          <Label htmlFor="bookmark-tag" className="text-sm font-medium">
            {localize('com_ui_bookmarks_title')} <span className="text-text-secondary">*</span>
          </Label>
          <Input
            type="text"
            id="bookmark-tag"
            aria-label={localize('com_ui_bookmarks_title')}
            {...register('tag', {
              required: localize('com_ui_field_required'),
              maxLength: {
                value: 128,
                message: localize('com_ui_field_max_length', {
                  field: localize('com_ui_bookmarks_title'),
                  length: 128,
                }),
              },
              validate: (value) => {
                return (
                  value === bookmark?.tag ||
                  bookmarks.every((bookmark) => bookmark.tag !== value) ||
                  localize('com_ui_bookmarks_tag_exists')
                );
              },
            })}
            aria-invalid={!!errors.tag}
            placeholder={localize('com_ui_enter_name')}
            aria-describedby={errors.tag ? 'bookmark-tag-error' : undefined}
          />
          {errors.tag && (
            <Label id="bookmark-tag-error" role="alert" className="text-sm text-text-destructive">
              {errors.tag.message}
            </Label>
          )}
        </div>

        {/* Description textarea */}
        <div className="space-y-2">
          <Label
            id="bookmark-description-label"
            htmlFor="bookmark-description"
            className="text-sm font-medium"
          >
            {localize('com_ui_description')}{' '}
            <span className="text-xs text-text-secondary">{localize('com_ui_optional')}</span>
          </Label>
          <Textarea
            {...register('description', {
              maxLength: {
                value: 1048,
                message: localize('com_ui_field_max_length', {
                  field: localize('com_ui_description'),
                  length: 1048,
                }),
              },
            })}
            id="bookmark-description"
            disabled={false}
            placeholder={localize('com_ui_enter_description')}
            className="min-h-[100px]"
            aria-labelledby="bookmark-description-label"
          />
        </div>

        {/* Add to conversation toggle */}
        {conversationId != null && conversationId && (
          <div className="flex items-center justify-between rounded-lg border border-border-light p-3">
            <Label
              id="add-to-conversation-label-bookmark"
              htmlFor="add-to-conversation-label-bookmark"
              className="cursor-pointer text-sm font-medium"
            >
              {localize('com_ui_bookmarks_add_to_conversation')}
            </Label>
            <Controller
              name="addToConversation"
              control={control}
              render={({ field }) => (
                <Switch
                  id="add-to-conversation-label-bookmark"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-labelledby="add-to-conversation-label-bookmark"
                />
              )}
            />
          </div>
        )}
      </div>
    </form>
  );
};

export default BookmarkForm;
