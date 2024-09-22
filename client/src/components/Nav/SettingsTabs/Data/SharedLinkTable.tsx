import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Link as LinkIcon, TrashIcon } from 'lucide-react';
import type { SharedLinksResponse, TSharedLink } from 'librechat-data-provider';
import { useDeleteSharedLinkMutation, useSharedLinksInfiniteQuery } from '~/data-provider';
import { useAuthContext, useLocalize, useNavScrolling } from '~/hooks';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { cn } from '~/utils';
import {
  Button,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TooltipAnchor,
  Skeleton,
  Spinner,
  OGDialog,
  OGDialogTrigger,
} from '~/components';

function ShareLinkRow({ sharedLink }: { sharedLink: TSharedLink }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const localize = useLocalize();

  const { showToast } = useToastContext();
  const mutation = useDeleteSharedLinkMutation({
    onError: () => {
      showToast({
        message: localize('com_ui_share_delete_error'),
        severity: NotificationSeverity.ERROR,
      });
      setIsDeleting(false);
    },
  });

  const confirmDelete = async (shareId: TSharedLink['shareId']) => {
    if (mutation.isLoading) {
      return;
    }
    setIsDeleting(true);
    await mutation.mutateAsync({ shareId });
    setIsDeleting(false);
  };

  return (
    <TableRow className={(cn(isDeleting && 'opacity-50'), 'hover:bg-transparent')}>
      <TableCell>
        <Link
          to={`/share/${sharedLink.shareId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center text-blue-500 hover:underline"
        >
          <LinkIcon className="mr-2 h-4 w-4" />
          {sharedLink.title}
        </Link>
      </TableCell>
      <TableCell>
        {new Date(sharedLink.createdAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </TableCell>
      <TableCell className="text-right">
        {sharedLink.conversationId && (
          <OGDialog>
            <OGDialogTrigger asChild>
              <TooltipAnchor
                description={localize('com_ui_delete')}
                render={
                  <Button
                    aria-label="Delete shared link"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                }
              ></TooltipAnchor>
            </OGDialogTrigger>
            <OGDialogTemplate
              showCloseButton={false}
              title={localize('com_ui_delete_conversation')}
              className="max-w-[450px]"
              main={
                <>
                  <div className="flex w-full flex-col items-center gap-2">
                    <div className="grid w-full items-center gap-2">
                      <Label
                        htmlFor="dialog-confirm-delete"
                        className="text-left text-sm font-medium"
                      >
                        {localize('com_ui_delete_confirm')} <strong>{sharedLink.title}</strong>
                      </Label>
                    </div>
                  </div>
                </>
              }
              selection={{
                selectHandler: () => confirmDelete(sharedLink.shareId),
                selectClasses:
                  'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
                selectText: localize('com_ui_delete'),
              }}
            />
          </OGDialog>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function ShareLinkTable({ className }) {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const [showLoading, setShowLoading] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isError, isLoading } =
    useSharedLinksInfiniteQuery({ pageNumber: '1', isPublic: true }, { enabled: isAuthenticated });

  const { containerRef } = useNavScrolling<SharedLinksResponse>({
    setShowLoading,
    hasNextPage: hasNextPage,
    fetchNextPage: fetchNextPage,
    isFetchingNextPage: isFetchingNextPage,
  });

  const sharedLinks = useMemo(() => data?.pages.flatMap((page) => page.sharedLinks) || [], [data]);

  const getRandomWidth = () => Math.floor(Math.random() * (400 - 170 + 1)) + 170;

  const skeletons = Array.from({ length: 11 }, (_, index) => {
    const randomWidth = getRandomWidth();
    return (
      <div key={index} className="flex h-10 w-full items-center">
        <div className="flex w-[410px] items-center">
          <Skeleton className="h-4" style={{ width: `${randomWidth}px` }} />
        </div>
        <div className="flex flex-grow justify-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mr-2 flex justify-end">
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    );
  });

  if (isLoading) {
    return <div className="text-gray-300">{skeletons}</div>;
  }

  if (isError) {
    return (
      <div className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200">
        {localize('com_ui_share_retrieve_error')}
      </div>
    );
  }

  if (sharedLinks.length === 0) {
    return <div className="text-gray-300">{localize('com_nav_shared_links_empty')}</div>;
  }

  return (
    <div
      className={cn(
        '-mr-2 grid max-h-[350px] w-full flex-1 flex-col gap-2 overflow-y-auto pr-2 transition-opacity duration-500',
        className,
      )}
      ref={containerRef}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{localize('com_nav_shared_links_name')}</TableHead>
            <TableHead>{localize('com_nav_shared_links_date_shared')}</TableHead>
            <TableHead className="text-right">{localize('com_assistants_actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sharedLinks.map((sharedLink) => (
            <ShareLinkRow key={sharedLink.shareId} sharedLink={sharedLink} />
          ))}
        </TableBody>
      </Table>
      {(isFetchingNextPage || showLoading) && <Spinner className="mx-auto my-4" />}
    </div>
  );
}
