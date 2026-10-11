import { useCallback, useId, useRef, useState } from 'react';
import { ExternalLink, Gitlab } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Chip,
  GithubIcon,
  Skeleton,
  Spinner,
} from '@librechat/client';
import type { PullRequestProvider } from 'librechat-data-provider';
import type { ComponentType } from 'react';
import type { TranslationKeys } from '~/hooks';
import {
  useGetStartupConfig,
  usePullRequestConnectionQuery,
  useConnectPullRequestAccountMutation,
  useDisconnectPullRequestAccountMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

const PROVIDERS: Record<
  PullRequestProvider,
  { Icon: ComponentType<{ className?: string }>; name: TranslationKeys }
> = {
  github: { Icon: GithubIcon, name: 'com_ui_pr_provider_github' },
  gitlab: { Icon: Gitlab, name: 'com_ui_pr_provider_gitlab' },
  bitbucket: { Icon: ExternalLink, name: 'com_ui_pr_provider_bitbucket' },
};

type ConnectError = 'com_ui_pr_account_connect_error' | 'com_ui_pr_account_popup_blocked';

/**
 * The user's own account for pull request lookups. One row for the provider the operator
 * configured: the status, and a single action to connect or disconnect it. The action button is
 * swapped as the state changes, so focus is carried over to whichever button replaces it.
 */
export default function ConnectedAccounts() {
  const localize = useLocalize();
  const rowId = useId();
  const { data: startupConfig } = useGetStartupConfig();
  const status = usePullRequestConnectionQuery();
  const connectMutation = useConnectPullRequestAccountMutation();
  const disconnectMutation = useDisconnectPullRequestAccountMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [connectError, setConnectError] = useState<ConnectError | null>(null);
  const [disconnectFailed, setDisconnectFailed] = useState(false);
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const keepFocus = useRef(false);

  /**
   * Callback ref, so a replacement button takes focus as it mounts after an action, but only
   * when the button it replaced took focus away with it.
   */
  const bindAction = useCallback((button: HTMLButtonElement | null) => {
    actionRef.current = button;
    if (button == null || !keepFocus.current) {
      return;
    }
    keepFocus.current = false;
    if (document.activeElement == null || document.activeElement === document.body) {
      button.focus();
    }
  }, []);

  const provider = startupConfig?.pullRequestsConnect;
  /** The server is the authority: an app it no longer has is nothing to connect to. */
  if (provider == null || status.data?.configured === false) {
    return null;
  }

  const { Icon, name: nameKey } = PROVIDERS[provider];
  const name = localize(nameKey);
  const labelId = `${rowId}-label`;
  const descriptionId = `${rowId}-description`;

  const connect = () => {
    if (connectMutation.isLoading) {
      return;
    }
    setConnectError(null);
    /** Opened inside the click so the browser treats it as user initiated. */
    const popup = window.open('', '_blank');
    if (popup == null) {
      setConnectError('com_ui_pr_account_popup_blocked');
      return;
    }
    popup.opener = null;
    connectMutation.mutate(undefined, {
      onSuccess: ({ url }) => {
        keepFocus.current = true;
        popup.location.href = url;
      },
      onError: () => {
        popup.close();
        setConnectError('com_ui_pr_account_connect_error');
      },
    });
  };

  const disconnect = () => {
    setDisconnectFailed(false);
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        keepFocus.current = true;
        setConfirmOpen(false);
      },
      onError: () => setDisconnectFailed(true),
    });
  };

  const retry = () => {
    keepFocus.current = true;
    status.refetch().then((result) => {
      if (result.isError) {
        keepFocus.current = false;
      }
    });
  };

  let statusContent = <Chip tone="neutral">{localize('com_ui_pr_account_checking')}</Chip>;
  let action = <Skeleton className="h-9 w-24" aria-hidden="true" />;

  if (status.isError) {
    statusContent = (
      <span className="text-text-destructive text-xs">
        {localize('com_ui_pr_account_status_error')}
      </span>
    );
    action = (
      <Button
        ref={bindAction}
        type="button"
        variant="outline"
        size="sm"
        aria-busy={status.isFetching}
        onClick={retry}
      >
        {status.isFetching ? <Spinner className="h-4 w-4" /> : localize('com_ui_retry')}
      </Button>
    );
  } else if (status.data?.connected === true) {
    statusContent = <Chip tone="success">{localize('com_ui_pr_account_connected')}</Chip>;
    action = (
      <AlertDialogTrigger asChild>
        <Button
          ref={bindAction}
          type="button"
          variant="outline"
          size="sm"
          aria-label={localize('com_ui_pr_account_disconnect_aria', { 0: name })}
        >
          {localize('com_ui_pr_account_disconnect')}
        </Button>
      </AlertDialogTrigger>
    );
  } else if (status.data != null) {
    statusContent = <Chip tone="neutral">{localize('com_ui_pr_account_not_connected')}</Chip>;
    action = (
      <Button
        ref={bindAction}
        type="button"
        variant="outline"
        size="sm"
        aria-label={localize('com_ui_pr_account_connect_aria', { 0: name })}
        aria-busy={connectMutation.isLoading}
        aria-disabled={connectMutation.isLoading}
        onClick={connect}
      >
        {connectMutation.isLoading ? (
          <Spinner className="h-4 w-4" />
        ) : (
          localize('com_ui_pr_account_connect')
        )}
      </Button>
    );
  }

  return (
    <AlertDialog
      open={confirmOpen}
      onOpenChange={(open) => {
        setConfirmOpen(open);
        setDisconnectFailed(false);
      }}
    >
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-3">
          <span className="text-text-secondary shrink-0" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p id={labelId} className="text-text-primary text-sm font-medium">
              {name}
            </p>
            <p id={descriptionId} className="text-text-secondary text-xs">
              {localize('com_ui_pr_account_description')}
            </p>
          </div>
          <div role="status" className="shrink-0">
            {statusContent}
          </div>
          <div className="shrink-0">{action}</div>
        </div>
        {connectError != null && (
          <p role="alert" className="text-text-destructive text-xs">
            {localize(connectError)}
          </p>
        )}
      </div>

      <AlertDialogContent
        className="w-11/12 max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          actionRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {localize('com_ui_pr_account_disconnect_title', { 0: name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {localize('com_ui_pr_account_disconnect_description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {disconnectFailed && (
          <p role="alert" className="text-text-destructive text-xs">
            {localize('com_ui_pr_account_disconnect_error')}
          </p>
        )}
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline">
              {localize('com_ui_cancel')}
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            aria-busy={disconnectMutation.isLoading}
            disabled={disconnectMutation.isLoading}
            onClick={disconnect}
          >
            {disconnectMutation.isLoading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              localize('com_ui_pr_account_disconnect')
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
