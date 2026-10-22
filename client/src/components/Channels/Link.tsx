import { useState } from 'react';
import { Button, Input, Label } from '@librechat/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys, MutationKeys } from 'librechat-data-provider';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { persistRedirectToSession } from '~/utils/redirect';
import { useAuthContext, useLocalize } from '~/hooks';

export default function ChannelLink() {
  const localize = useLocalize();
  const { isAuthenticated, isAuthReady } = useAuthContext();
  const [params] = useSearchParams();
  const location = useLocation();
  const cache = useQueryClient();
  const token = params.get('token') ?? '';
  const [code, setCode] = useState('');
  const query = useQuery([QueryKeys.channelLink, token], () => dataService.getChannelLink(token), {
    enabled: isAuthenticated && /^[a-f0-9]{64}$/.test(token),
    retry: false,
    cacheTime: 0,
  });
  const confirm = useMutation({
    mutationKey: [MutationKeys.channelLink],
    mutationFn: () => dataService.confirmChannelLink({ token, code: code.trim() }),
    onError: () => {
      void query.refetch();
    },
    onSuccess: () => {
      setCode('');
      void cache.invalidateQueries([QueryKeys.channels]);
    },
  });
  if (!isAuthReady) return <p role="status">{localize('com_ui_loading')}</p>;
  if (!isAuthenticated)
    return (
      <Navigate
        replace
        to={`/login?redirect_to=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  return (
    <main className="text-text-primary mx-auto w-full max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-semibold">{localize('com_channels_link_title')}</h1>
      {confirm.isSuccess ? (
        <p role="status">{localize('com_channels_linked')}</p>
      ) : (
        <>
          {query.isFetching && <p role="status">{localize('com_ui_loading')}</p>}
          {(query.isError || !/^[a-f0-9]{64}$/.test(token)) && (
            <p role="alert">{localize('com_channels_link_expired')}</p>
          )}
          {query.data?.reauthUrl && (
            <Button asChild>
              <a
                href={query.data.reauthUrl}
                onClick={() => persistRedirectToSession(location.pathname + location.search)}
              >
                {localize('com_channels_sign_in_again')}
              </a>
            </Button>
          )}
          {query.data && !query.data.reauthUrl && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                confirm.mutate();
              }}
            >
              <p>{query.data.name}</p>
              <p>
                {localize('com_channels_identity', {
                  team: query.data.teamId,
                  user: query.data.senderId,
                })}
              </p>
              <p>{localize('com_channels_link_consent')}</p>
              <Label htmlFor="channel-code">{localize('com_channels_code')}</Label>
              <Input
                id="channel-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
              {confirm.isError && <p role="alert">{localize('com_channels_link_invalid')}</p>}
              <Button type="submit" disabled={confirm.isLoading}>
                {localize('com_channels_confirm')}
              </Button>
            </form>
          )}
        </>
      )}
      <Link to="/channels">{localize('com_channels_title')}</Link>
    </main>
  );
}
