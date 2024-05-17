import { useAuthContext, useLocalize, useNavScrolling } from '~/hooks';
import { MessageSquare, Link as LinkIcon } from 'lucide-react';
import { useMemo, useState, MouseEvent } from 'react';
import { useDeleteSharedLinkMutation, useSharedLinksInfiniteQuery } from '~/data-provider';

import { cn } from '~/utils';
import {
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TrashIcon,
} from '~/components';
import { SharedLinksResponse, TSharedLink } from 'librechat-data-provider';
import { Link } from 'react-router-dom';

function SharedLinkDeleteButton({
  shareId,
  setIsDeleting,
}: {
  shareId: string;
  setIsDeleting: (isDeleting: boolean) => void;
}) {
  const localize = useLocalize();
  const mutation = useDeleteSharedLinkMutation();

  const handleDelete = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (mutation.isLoading) {
      return;
    }
    setIsDeleting(true);
    await mutation.mutateAsync({ shareId });
    setIsDeleting(false);
  };
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span onClick={handleDelete}>
            <TrashIcon />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={0}>
          {localize('com_ui_delete')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
function SourceChatButton({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to={`/c/${conversationId}`} target="_blank" rel="noreferrer">
            <MessageSquare className="h-4 w-4 hover:text-gray-300" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={0}>
          {localize('com_nav_source_chat')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ShareLinkRow({ sharedLink }: { sharedLink: TSharedLink }) {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <tr
      key={sharedLink.conversationId}
      className="border-b border-gray-200 text-sm font-normal dark:border-white/10"
    >
      <td
        className={cn(
          'flex items-center py-3 text-blue-800/70 dark:text-blue-500',
          isDeleting && 'opacity-50',
        )}
      >
        <Link to={`/share/${sharedLink.shareId}`} target="_blank" rel="noreferrer" className="flex">
          <LinkIcon className="mr-1 h-5 w-5" />
          {sharedLink.title}
        </Link>
      </td>
      <td className="p-3">
        <div className="flex justify-between">
          <div className={cn('flex justify-start dark:text-gray-200', isDeleting && 'opacity-50')}>
            {new Date(sharedLink.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div
            className={cn(
              'flex items-center justify-end gap-3 text-gray-400',
              isDeleting && 'opacity-50',
            )}
          >
            {sharedLink.conversationId && (
              <>
                <SourceChatButton conversationId={sharedLink.conversationId} />
                <div className={cn('h-4 w-4 cursor-pointer', !isDeleting && 'hover:text-gray-300')}>
                  <SharedLinkDeleteButton
                    shareId={sharedLink.shareId}
                    setIsDeleting={setIsDeleting}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
export default function ShareLinkTable({ className }: { className?: string }) {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const [showLoading, setShowLoading] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSharedLinksInfiniteQuery(
    { pageNumber: '1', isPublic: true },
    { enabled: isAuthenticated },
  );

  const { containerRef } = useNavScrolling<SharedLinksResponse>({
    setShowLoading,
    hasNextPage: hasNextPage,
    fetchNextPage: fetchNextPage,
    isFetchingNextPage: isFetchingNextPage,
  });

  const sharedLinks = useMemo(() => data?.pages.flatMap((page) => page.sharedLinks) || [], [data]);
  const classProp: { className?: string } = {
    className: 'p-1 hover:text-black dark:hover:text-white',
  };
  if (className) {
    classProp.className = className;
  }

  if (!sharedLinks || sharedLinks.length === 0) {
    return <div className="text-gray-300">{localize('com_nav_shared_links_empty')}</div>;
  }

  return (
    <div
      className={cn(
        'grid w-full gap-2',
        '-mr-2 flex-1 flex-col overflow-y-auto pr-2 transition-opacity duration-500',
        'max-h-[350px]',
      )}
      ref={containerRef}
    >
      <table className="table-fixed text-left">
        <thead className="sticky top-0 bg-white dark:bg-gray-700">
          <tr className="border-b border-gray-200 text-sm font-semibold text-gray-500 dark:border-white/10 dark:text-gray-200">
            <th className="p-3">{localize('com_nav_shared_links_name')}</th>
            <th className="p-3">{localize('com_nav_shared_links_date_shared')}</th>
          </tr>
        </thead>
        <tbody>
          {sharedLinks.map((sharedLink) => (
            <ShareLinkRow key={sharedLink.shareId} sharedLink={sharedLink} />
          ))}
        </tbody>
      </table>
      {(isFetchingNextPage || showLoading) && (
        <Spinner className={cn('m-1 mx-auto mb-4 h-4 w-4 text-black dark:text-white')} />
      )}
    </div>
  );
}
