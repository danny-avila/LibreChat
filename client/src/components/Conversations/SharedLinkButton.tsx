import copy from 'copy-to-clipboard';
import { Copy, Link } from 'lucide-react';
import { Button } from '~/components/ui';
import { Spinner } from '~/components/svg';
import { useState } from 'react';
import { useUpdateSharedLinkMutation } from '~/data-provider';
import { TSharedLink } from 'librechat-data-provider';

export default function SharedLinkButton({
  conversationId,
  share,
  setShare,
  isUpdated,
  setIsUpdated,
}: {
  conversationId: string;
  share: TSharedLink;
  setShare: (share: TSharedLink) => void;
  isUpdated: boolean;
  setIsUpdated: (isUpdated: boolean) => void;
}) {
  const [isCopying, setIsCopying] = useState(false);

  const { mutateAsync, isLoading } = useUpdateSharedLinkMutation();

  const copyLink = () => {
    if (!share) {
      return;
    }
    setIsCopying(true);
    const sharedLink =
      window.location.protocol + '//' + window.location.host + '/share/' + share.shareId;
    copy(sharedLink);
    setTimeout(() => {
      setIsCopying(false);
    }, 1500);
  };
  const updateSharedLink = async () => {
    if (!share) {
      return;
    }
    const result = await mutateAsync({
      shareId: share.shareId,
      conversationId: conversationId,
      isPublic: true,
      isVisible: true,
      isAnonymous: true,
    });

    if (result) {
      setShare(result);
      setIsUpdated(true);
      copyLink();
    }
  };
  const getHandler = () => {
    if (isUpdated) {
      return {
        handler: () => {
          copyLink();
        },
        label: (
          <>
            <Copy className="mr-2 h-4 w-4" />
            Copy link
          </>
        ),
      };
    }
    if (share?.isPublic) {
      return {
        handler: async () => {
          await updateSharedLink();
        },

        label: (
          <>
            <Link className="mr-2 h-4 w-4" />
            Update link
          </>
        ),
      };
    }
    return {
      handler: updateSharedLink,
      label: (
        <>
          <Link className="mr-2 h-4 w-4" />
          Create link
        </>
      ),
    };
  };

  const handlers = getHandler();
  return (
    <Button
      disabled={isLoading || isCopying}
      onClick={() => {
        handlers.handler();
      }}
      className="min-w-32 whitespace-nowrap bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-800"
    >
      {isCopying && (
        <>
          <Copy className="mr-2 h-4 w-4" />
          Copied!
        </>
      )}
      {!isCopying && !isLoading && handlers.label}
      {!isCopying && isLoading && <Spinner className="h-4 w-4" />}
    </Button>
  );
}
