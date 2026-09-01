import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Label,
  OGDialog,
  OGDialogTemplate,
  OGDialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  useToastContext,
} from '@librechat/client';
import type { CodeEnvironmentPairingResponse } from '~/data-provider/CodeEnvironments';
import {
  useCodeEnvironmentsQuery,
  useDeleteCodeEnvironmentMutation,
  usePairCodeEnvironmentMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

function WorkerCommand({ pairing }: { pairing: CodeEnvironmentPairingResponse['pairing'] }) {
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const command = `librechat-code pair ${shellQuote(pairing.endpoint)} ${shellQuote(pairing.code)} --worker-id ${shellQuote(pairing.workerId)}`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-medium bg-surface-secondary p-3">
      <p className="text-sm font-medium text-text-primary">
        {localize('com_ui_code_environment_pairing_ready')}
      </p>
      <p className="text-xs text-text-secondary">
        {localize('com_ui_code_environment_pairing_description')}
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-tertiary p-3 text-xs text-text-primary">
        {command}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            showToast({ message: localize('com_ui_copied_to_clipboard'), status: 'success' });
          } catch {
            showToast({ message: localize('com_ui_copy_failed'), status: 'error' });
          }
        }}
      >
        {localize('com_ui_copy_to_clipboard')}
      </Button>
    </div>
  );
}

export default function CodeEnvironments() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const query = useCodeEnvironmentsQuery();
  const pairMutation = usePairCodeEnvironmentMutation();
  const deleteMutation = useDeleteCodeEnvironmentMutation();
  const [name, setName] = useState('');
  const [controlPlaneId, setControlPlaneId] = useState('');
  const [pairing, setPairing] = useState<CodeEnvironmentPairingResponse['pairing']>();
  const controlPlanes = query.data?.controlPlanes ?? [];
  const selectedControlPlane = controlPlaneId || controlPlanes[0]?.id || '';

  useEffect(() => {
    if (pairing == null) return;
    const remaining = Date.parse(pairing.expiresAt) - Date.now();
    const delay = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
    const timeout = window.setTimeout(() => setPairing(undefined), delay);
    return () => window.clearTimeout(timeout);
  }, [pairing]);

  const pair = () => {
    const trimmedName = name.trim();
    if (!trimmedName || !selectedControlPlane) return;
    pairMutation.mutate(
      { name: trimmedName, controlPlaneId: selectedControlPlane },
      {
        onSuccess: (result) => {
          setName('');
          setPairing(result.pairing);
          showToast({
            message: localize('com_ui_code_environment_pairing_created'),
            status: 'success',
          });
        },
        onError: () =>
          showToast({
            message: localize('com_ui_code_environment_pairing_error'),
            status: 'error',
          }),
      },
    );
  };

  let pairingControls = (
    <p className="text-sm text-text-secondary">{localize('com_ui_code_environment_unavailable')}</p>
  );
  if (query.isLoading) {
    pairingControls = (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Spinner />
        {localize('com_ui_loading')}
      </div>
    );
  } else if (query.isError) {
    pairingControls = (
      <p className="text-sm text-text-destructive">
        {localize('com_ui_code_environment_load_error')}
      </p>
    );
  } else if (controlPlanes.length > 0) {
    pairingControls = (
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Input
          id="code-environment-name"
          value={name}
          maxLength={100}
          placeholder={localize('com_ui_code_environment_name_placeholder')}
          onChange={(event) => setName(event.target.value)}
        />
        <Select value={selectedControlPlane} onValueChange={setControlPlaneId}>
          <SelectTrigger aria-label={localize('com_ui_code_environment_control_plane')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {controlPlanes.map((controlPlane) => (
              <SelectItem key={controlPlane.id} value={controlPlane.id}>
                {controlPlane.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" disabled={!name.trim() || pairMutation.isLoading} onClick={pair}>
          {pairMutation.isLoading ? <Spinner /> : localize('com_ui_code_environment_pair')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <Label htmlFor="code-environment-name">{localize('com_ui_code_environments')}</Label>
        <p className="mt-1 text-xs text-text-secondary">
          {localize('com_ui_code_environments_description')}
        </p>
      </div>

      {pairingControls}

      {pairing != null && <WorkerCommand pairing={pairing} />}

      <div className="flex flex-col gap-2">
        {(query.data?.environments ?? []).map((environment) => (
          <div
            key={environment.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border-medium p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{environment.name}</p>
              <p className="truncate text-xs text-text-secondary">{environment.id}</p>
            </div>
            {environment.canDelete && (
              <OGDialog>
                <OGDialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    {localize('com_ui_delete')}
                  </Button>
                </OGDialogTrigger>
                <OGDialogTemplate
                  showCloseButton={false}
                  title={localize('com_ui_code_environment_remove_title')}
                  main={
                    <p className="text-sm text-text-secondary">
                      {localize('com_ui_code_environment_remove_description')}
                    </p>
                  }
                  selection={{
                    selectHandler: () =>
                      deleteMutation.mutate(environment.id, {
                        onSuccess: () =>
                          showToast({
                            message: localize('com_ui_code_environment_removed'),
                            status: 'success',
                          }),
                        onError: () =>
                          showToast({
                            message: localize('com_ui_code_environment_remove_error'),
                            status: 'error',
                          }),
                      }),
                    selectClasses:
                      'bg-surface-destructive text-text-on-status transition-all duration-200 hover:bg-surface-destructive-hover',
                    selectText: localize('com_ui_delete'),
                  }}
                />
              </OGDialog>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
