import { useState } from 'react';
import { Link } from 'react-router-dom';
import { dataService, QueryKeys, MutationKeys, PermissionBits } from 'librechat-data-provider';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@librechat/client';
import type { ChannelConnection } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';

export default function ChannelSettings() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();
  const cache = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [mode, setMode] = useState<'http' | 'socket'>('http');
  const [installationId, setInstallationId] = useState('');
  const [appId, setAppId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [appToken, setAppToken] = useState('');
  const [saved, setSaved] = useState(false);
  const query = useQuery([QueryKeys.channels], dataService.getChannels, {
    enabled: isAuthenticated,
    retry: false,
  });
  const agents = useInfiniteQuery(
    [QueryKeys.agents, 'channels', 'mine'],
    ({ pageParam }) =>
      dataService.listAgents({
        requiredPermission: PermissionBits.VIEW,
        mine: 1,
        cursor: pageParam,
      }),
    {
      enabled: isAuthenticated && query.isSuccess,
      getNextPageParam: (page) => (page.has_more ? page.after : undefined),
    },
  );
  const invalidate = () => cache.invalidateQueries([QueryKeys.channels]);
  const manifest = useMutation({
    mutationKey: [MutationKeys.channelManifest],
    mutationFn: () =>
      dataService.createChannelManifest({
        agentId,
        mode,
        installationId: installationId || undefined,
      }),
    onSuccess: (result) => {
      setInstallationId(result.installationId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.manifest, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'slack-agent-manifest.json';
      anchor.click();
      URL.revokeObjectURL(url);
      void invalidate();
    },
  });
  const save = useMutation({
    mutationKey: [MutationKeys.channelSave],
    mutationFn: () =>
      dataService.saveChannel(installationId, {
        agentId,
        mode,
        appId,
        enabled: false,
        botToken: botToken || undefined,
        signingSecret: signingSecret || undefined,
        appToken: appToken || undefined,
      }),
    onSuccess: () => {
      setSaved(true);
      setBotToken('');
      setSigningSecret('');
      setAppToken('');
      void invalidate();
    },
  });
  const check = useMutation({
    mutationKey: [MutationKeys.channelCheck],
    mutationFn: dataService.checkChannel,
  });
  const enable = useMutation({
    mutationKey: [MutationKeys.channelEnable],
    mutationFn: dataService.enableChannel,
    onSuccess: invalidate,
  });
  const disable = useMutation({
    mutationKey: [MutationKeys.channelDisable],
    mutationFn: dataService.disableChannel,
    onSuccess: invalidate,
  });
  const unlink = useMutation({
    mutationKey: [MutationKeys.channelUnlink],
    mutationFn: dataService.unlinkChannel,
    onSuccess: invalidate,
  });
  const edit = (item: ChannelConnection) => {
    setAgentId(item.agentId);
    setInstallationId(item.id);
    setAppId(item.appId);
    setMode(item.mode);
    setBotToken('');
    setSigningSecret('');
    setAppToken('');
    setSaved(false);
    save.reset();
    manifest.reset();
  };
  const hasError =
    query.isError ||
    agents.isError ||
    manifest.isError ||
    save.isError ||
    disable.isError ||
    unlink.isError ||
    check.isError ||
    enable.isError;
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">{localize('com_channels_title')}</h1>
      <p>{localize('com_channels_intro')}</p>
      {query.isLoading && <p role="status">{localize('com_ui_loading')}</p>}
      {hasError && (
        <div role="alert">
          <p>{localize('com_channels_error')}</p>
          <Button
            variant="outline"
            onClick={() => {
              void query.refetch();
              void agents.refetch();
            }}
          >
            {localize('com_ui_retry')}
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <>
          {check.isSuccess && <p role="status">{localize('com_channels_checked')}</p>}
          <section aria-label={localize('com_channels_connections')} className="space-y-3">
            <h2 className="font-semibold">{localize('com_channels_connections')}</h2>
            {query.data.connections.length === 0 && <p>{localize('com_channels_empty')}</p>}
            {query.data.connections.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3">
                <span>{item.name}</span>
                <span>
                  {localize(item.enabled ? 'com_channels_enabled' : 'com_channels_disabled')}
                </span>
                {item.editable && (
                  <Button variant="outline" onClick={() => edit(item)}>
                    {localize('com_ui_edit')}
                  </Button>
                )}
                {item.editable && item.appId && (
                  <Button
                    variant="outline"
                    disabled={check.isLoading}
                    onClick={() => check.mutate(item.id)}
                  >
                    {localize('com_channels_check')}
                  </Button>
                )}
                {item.editable && item.appId && !item.enabled && (
                  <Button
                    variant="outline"
                    disabled={enable.isLoading}
                    onClick={() => enable.mutate(item.id)}
                  >
                    {localize('com_channels_enable')}
                  </Button>
                )}
                {item.editable && item.enabled && (
                  <Button
                    variant="outline"
                    disabled={disable.isLoading}
                    onClick={() => disable.mutate(item.id)}
                  >
                    {localize('com_channels_disable')}
                  </Button>
                )}
                {item.linked && (
                  <Button
                    variant="outline"
                    disabled={unlink.isLoading}
                    onClick={() => unlink.mutate(item.id)}
                  >
                    {localize('com_channels_unlink')}
                  </Button>
                )}
              </div>
            ))}
          </section>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setSaved(false);
              save.mutate();
            }}
          >
            <h2 className="font-semibold">{localize('com_channels_setup')}</h2>
            <div className="space-y-2">
              <Label htmlFor="channel-agent">{localize('com_channels_agent')}</Label>
              <Select
                value={agentId}
                onValueChange={(value) => {
                  setAgentId(value);
                  setInstallationId('');
                  setAppId('');
                  setBotToken('');
                  setSigningSecret('');
                  setAppToken('');
                  setSaved(false);
                }}
              >
                <SelectTrigger id="channel-agent">
                  <SelectValue placeholder={localize('com_channels_choose_agent')} />
                </SelectTrigger>
                <SelectContent>
                  {agents.data?.pages
                    .flatMap((page) => page.data)
                    .map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name || agent.id}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {agents.hasNextPage && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void agents.fetchNextPage()}
                  disabled={agents.isFetchingNextPage}
                >
                  {localize('com_channels_more')}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-mode">{localize('com_channels_mode')}</Label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value === 'socket' ? 'socket' : 'http')}
              >
                <SelectTrigger id="channel-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">{localize('com_channels_http')}</SelectItem>
                  <SelectItem value="socket">{localize('com_channels_socket')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p>{localize('com_channels_manifest_help')}</p>
            <Button
              type="button"
              variant="outline"
              disabled={!agentId || manifest.isLoading}
              onClick={() => manifest.mutate()}
            >
              {localize('com_channels_manifest')}
            </Button>
            {installationId && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="channel-app">{localize('com_channels_app')}</Label>
                  <Input
                    id="channel-app"
                    value={appId}
                    onChange={(event) => setAppId(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel-bot">{localize('com_channels_bot_token')}</Label>
                  <Input
                    id="channel-bot"
                    type="password"
                    autoComplete="new-password"
                    value={botToken}
                    onChange={(event) => setBotToken(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="channel-secret">{localize('com_channels_signing_secret')}</Label>
                  <Input
                    id="channel-secret"
                    type="password"
                    autoComplete="new-password"
                    value={signingSecret}
                    onChange={(event) => setSigningSecret(event.target.value)}
                  />
                </div>
                {mode === 'socket' && (
                  <div className="space-y-2">
                    <Label htmlFor="channel-socket">{localize('com_channels_app_token')}</Label>
                    <Input
                      id="channel-socket"
                      type="password"
                      autoComplete="new-password"
                      value={appToken}
                      onChange={(event) => setAppToken(event.target.value)}
                    />
                  </div>
                )}
                <p>{localize('com_channels_credentials_help')}</p>
                <Button type="submit" disabled={save.isLoading}>
                  {localize('com_channels_connect')}
                </Button>
              </>
            )}
            {saved && (
              <p role="status">
                {localize(
                  mode === 'http' ? 'com_channels_saved_http' : 'com_channels_saved_socket',
                )}
              </p>
            )}
          </form>
        </>
      )}
      <Link to="/c/new">{localize('com_channels_back')}</Link>
    </main>
  );
}
