import { useCallback, useState, useMemo } from 'react';
import { Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { TrashIcon, ExternalLink, MessageSquare } from 'lucide-react';
import {
  Label,
  Button,
  Spinner,
  OGDialog,
  DataTable,
  OGDialogTitle,
  TooltipAnchor,
  OGDialogHeader,
  OGDialogTrigger,
  OGDialogContent,
  useToastContext,
  OGDialogTemplate,
} from '@librechat/client';
import type { SharedImageItem } from 'librechat-data-provider';
import { useSharedImagesQuery, useRevokeSharedImageMutation } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

const PAGE_SIZE = 50;

export default function SharedImages() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const [revokeRow, setRevokeRow] = useState<SharedImageItem | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useSharedImagesQuery(
      { pageSize: PAGE_SIZE },
      {
        enabled: isOpen,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    );

  const allImages = useMemo(() => data?.pages.flatMap((page) => page.images) ?? [], [data?.pages]);

  const handleFetchNextPage = useCallback(async () => {
    if (hasNextPage !== true || isFetchingNextPage) {
      return;
    }
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const revokeMutation = useRevokeSharedImageMutation({
    onSuccess: async () => {
      setIsRevokeOpen(false);
      setRevokeRow(null);
      await refetch();
      showToast({ message: localize('com_ui_revoke_shared_image_success') });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_revoke_shared_image_error'),
        severity: NotificationSeverity.ERROR,
      });
    },
  });

  const confirmRevoke = useCallback(() => {
    if (revokeRow) {
      revokeMutation.mutate({ shareId: revokeRow.shareId, file_id: revokeRow.file_id });
    }
  }, [revokeRow, revokeMutation]);

  const columns = useMemo(
    () => [
      {
        accessorKey: 'filename',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_ui_name')}
          </Label>
        ),
        cell: ({ row }) => {
          const { filename, shareId, shareTitle } = row.original;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm">{filename}</span>
              <Link
                to={`/share/${shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex w-fit items-center gap-1 truncate text-xs text-blue-600 underline decoration-1 underline-offset-2 hover:decoration-2"
              >
                <span className="truncate">{shareTitle}</span>
                <ExternalLink
                  className="size-3 flex-shrink-0 opacity-70 group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
            </div>
          );
        },
        meta: { size: '40%', mobileSize: '55%' },
      },
      {
        accessorKey: 'createdAt',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_ui_date')}
          </Label>
        ),
        cell: ({ row }) => formatDate(row.original.createdAt?.toString() ?? '', false),
        meta: { size: '15%', mobileSize: '20%' },
      },
      {
        accessorKey: 'actions',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_assistants_actions')}
          </Label>
        ),
        meta: { size: '10%', mobileSize: '25%' },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <TooltipAnchor
              description={localize('com_ui_open_source_chat_new_tab')}
              render={
                <a
                  href={`/c/${row.original.conversationId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md p-0 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={localize('com_ui_open_source_chat_new_tab_title', {
                    title: row.original.shareTitle || localize('com_ui_untitled'),
                  })}
                >
                  <MessageSquare className="size-4" aria-hidden="true" />
                </a>
              }
            />
            <TooltipAnchor
              description={localize('com_ui_revoke_shared_image_heading')}
              render={
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-surface-hover"
                  onClick={() => {
                    setRevokeRow(row.original);
                    setIsRevokeOpen(true);
                  }}
                  aria-label={localize('com_ui_revoke_shared_image', {
                    title: row.original.filename,
                  })}
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                </Button>
              }
            />
          </div>
        ),
      },
    ],
    [localize],
  );

  return (
    <div className="flex items-center justify-between">
      <Label id="shared-images-label">{localize('com_nav_shared_images')}</Label>

      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild onClick={() => setIsOpen(true)}>
          <Button aria-labelledby="shared-images-label" variant="outline">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>

        <OGDialogContent
          title={localize('com_nav_shared_images')}
          className="w-11/12 max-w-4xl bg-background text-text-primary shadow-2xl"
        >
          <OGDialogHeader>
            <OGDialogTitle>{localize('com_nav_shared_images')}</OGDialogTitle>
          </OGDialogHeader>
          {isLoading && <Spinner className="mx-auto h-6 w-6" />}
          {!isLoading && isError && (
            <p className="py-6 text-center text-sm text-text-secondary">
              {localize('com_ui_shared_images_load_error')}
            </p>
          )}
          {!isLoading && !isError && allImages.length === 0 && (
            <p className="py-6 text-center text-sm text-text-secondary">
              {localize('com_ui_shared_images_empty')}
            </p>
          )}
          {!isLoading && !isError && allImages.length > 0 && (
            <DataTable
              columns={columns}
              data={allImages}
              className="scrollbar-gutter-stable"
              showCheckboxes={false}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={handleFetchNextPage}
              isLoading={isLoading}
              enableSearch={false}
            />
          )}
        </OGDialogContent>
      </OGDialog>
      <OGDialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_revoke_shared_image_heading')}
          className="max-w-[450px]"
          main={
            <div
              id="revoke-shared-image-dialog"
              className="flex w-full flex-col items-center gap-2"
            >
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="dialog-confirm-revoke" className="text-left text-sm font-medium">
                  <Trans i18nKey="com_ui_revoke_shared_image_confirm" />
                </Label>
              </div>
            </div>
          }
          selection={{
            selectHandler: confirmRevoke,
            selectClasses: `bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white ${
              revokeMutation.isLoading ? 'cursor-not-allowed opacity-80' : ''
            }`,
            selectText: revokeMutation.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
}
