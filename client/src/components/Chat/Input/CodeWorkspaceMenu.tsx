import * as Ariakit from '@ariakit/react';
import { Check, ChevronDown, Folder, FolderSync, FolderX } from 'lucide-react';
import { TooltipAnchor, composerControlClasses, useToastContext } from '@librechat/client';
import type { CodeWorkspaceSelection, TConversation } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { CodeWorkspaceRelocation, CodeWorkspaceResult, TranslationKeys } from '~/hooks';
import {
  cn,
  codeWorkspaceErrorKeys,
  getCodeWorkspaceErrorReason,
  getResponseStatus,
} from '~/utils';
import { useMoveConversationCodeEnvironmentMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const stateLabels: Partial<Record<CodeWorkspaceResult['state'], TranslationKeys>> = {
  loading: 'com_ui_code_workspace_loading',
  choose: 'com_ui_code_workspace_choose',
  missing: 'com_ui_code_workspace_missing',
  unavailable: 'com_ui_code_workspace_unavailable',
  unsupported: 'com_ui_code_workspace_unsupported',
  without_attached: 'com_ui_code_workspace_without_attached',
};

const headingClasses = 'px-2.5 py-1.5 text-xs font-medium text-text-secondary';

const menuItemClasses = (selected = false) =>
  cn(
    'group flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2',
    'outline-none transition-colors duration-theme-fast',
    'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
    selected && 'bg-surface-active-alt',
  );

/** A stale view of the decision recovers on reload; the other reasons explain themselves. */
function moveErrorKey(error: unknown): TranslationKeys {
  const reason = getCodeWorkspaceErrorReason(error);
  if (reason === 'locked') return 'com_ui_code_workspace_move_stale';
  if (reason != null) return codeWorkspaceErrorKeys[reason];
  if (getResponseStatus(error) === 409) return 'com_ui_code_workspace_move_busy';
  return 'com_ui_code_workspace_move_error';
}

function describeRelocation(
  relocation: CodeWorkspaceRelocation,
  localize: ReturnType<typeof useLocalize>,
): { label: string; info: string } {
  const targetNames = relocation.targets
    .map(({ environment }) => environment.name ?? environment.id)
    .join(', ');
  const previousNames = relocation.previous.map(({ id, name }) => name ?? id).join(', ');
  return {
    label:
      relocation.targets.length === 1
        ? localize('com_ui_code_workspace_move_to', { 0: targetNames })
        : localize('com_ui_code_workspace_move'),
    info: previousNames
      ? localize('com_ui_code_workspace_move_info', { 0: previousNames, 1: targetNames })
      : localize('com_ui_code_workspace_move_info_added', { 0: targetNames }),
  };
}

export default function CodeWorkspaceMenu({
  setConversation,
  workspace,
  disabled,
}: {
  setConversation: SetterOrUpdater<TConversation | null>;
  workspace: CodeWorkspaceResult;
  disabled: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const menuStore = Ariakit.useMenuStore({ focusLoop: true, placement: 'top-start' });
  const isOpen = menuStore.useState('open');
  const moveMutation = useMoveConversationCodeEnvironmentMutation();

  if (!workspace.required) return null;

  const { relocation } = workspace;
  const environmentIds = new Set(workspace.environments.map(({ environment }) => environment.id));
  const selectWorkspace = (selection: CodeWorkspaceSelection) => {
    workspace.rememberSelection(selection);
    setConversation((current) => {
      if (current == null) return current;
      const retained = (current.codeWorkspaces ?? workspace.selections ?? []).filter(
        ({ environmentId }) =>
          environmentIds.has(environmentId) && environmentId !== selection.environmentId,
      );
      return {
        ...current,
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [...retained, selection].sort((a, b) =>
          a.environmentId.localeCompare(b.environmentId),
        ),
      };
    });
  };
  const selectWithoutAttached = () => {
    setConversation((current) =>
      current == null
        ? current
        : {
            ...current,
            codeEnvironmentMode: 'without_attached',
            codeWorkspaces: undefined,
          },
    );
  };
  const moveToWorkspace = (target: CodeWorkspaceRelocation, selection: CodeWorkspaceSelection) => {
    moveMutation.mutate(
      {
        conversationId: target.conversationId,
        from: target.from,
        to: [...target.retained, selection],
      },
      {
        onSuccess: ({ conversationId, codeEnvironmentMode, codeWorkspaces }) => {
          workspace.rememberSelection(selection);
          setConversation((current) =>
            current?.conversationId === conversationId
              ? { ...current, codeEnvironmentMode, codeWorkspaces }
              : current,
          );
        },
        onError: (error) => {
          showToast({ message: localize(moveErrorKey(error)), status: 'error' });
        },
      },
    );
  };
  const onlyEnvironment = workspace.environments.length === 1 ? workspace.environments[0] : null;
  const onlyDescriptor = onlyEnvironment?.workspaces.find(
    ({ id }) => id === onlyEnvironment.selected?.workspaceId,
  );
  const labelKey = stateLabels[workspace.state];
  let label =
    workspace.mode === 'without_attached'
      ? localize('com_ui_code_workspace_without_attached')
      : (onlyDescriptor?.name ?? onlyDescriptor?.id);
  if (label == null && workspace.state === 'ready') {
    label = localize('com_ui_code_workspaces_selected', {
      0: workspace.selections?.length ?? 0,
    });
  } else if (label == null) {
    label = labelKey ? localize(labelKey) : localize('com_ui_code_workspace_choose');
  }
  const Icon =
    workspace.mode === 'without_attached' ||
    workspace.state === 'missing' ||
    workspace.state === 'unavailable'
      ? FolderX
      : Folder;

  if (workspace.locked && relocation == null) {
    if (workspace.canSubmit) return null;
    const recovery = localize('com_ui_code_workspace_locked_recovery');
    return (
      <TooltipAnchor
        description={recovery}
        render={
          <div
            data-testid="code-workspace-locked-status"
            role="status"
            aria-label={`${label}. ${recovery}`}
            className={cn(composerControlClasses(), 'min-w-0 max-w-full cursor-default px-2.5')}
          />
        }
      >
        <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 max-w-[16rem] truncate">{label}</span>
      </TooltipAnchor>
    );
  }

  const relocationText = relocation == null ? null : describeRelocation(relocation, localize);
  const buttonDisabled = disabled || moveMutation.isLoading;
  const ButtonIcon = relocationText == null ? Icon : FolderSync;

  return (
    <Ariakit.MenuProvider store={menuStore}>
      <TooltipAnchor
        description={relocationText?.info ?? localize('com_ui_code_workspace')}
        disabled={isOpen}
        render={
          <Ariakit.MenuButton
            disabled={buttonDisabled}
            data-testid={relocationText == null ? 'code-workspace' : 'code-workspace-move'}
            aria-label={
              relocationText == null
                ? `${localize('com_ui_code_workspace')}: ${label}`
                : `${relocationText.label}. ${relocationText.info}`
            }
            className={cn(
              composerControlClasses(),
              'min-w-0 max-w-full px-2.5 md:px-theme-normal',
              isOpen && 'bg-surface-hover',
              buttonDisabled && 'cursor-not-allowed opacity-50',
            )}
          />
        }
      >
        <ButtonIcon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="min-w-0 max-w-[12rem] truncate">{relocationText?.label ?? label}</span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-text-secondary transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </TooltipAnchor>
      <Ariakit.Menu
        portal={true}
        gutter={8}
        unmountOnHide={true}
        className={cn(
          'z-50 flex min-w-[280px] max-w-[min(360px,calc(100vw-2rem))] flex-col rounded-xl',
          'max-h-[var(--popover-available-height)] overflow-y-auto border border-border-light bg-presentation p-1.5 shadow-lg',
          'origin-bottom opacity-0 transition-[opacity,transform] duration-200 ease-out',
          'data-[enter]:scale-100 data-[enter]:opacity-100',
          'scale-95 data-[leave]:scale-95 data-[leave]:opacity-0',
        )}
      >
        {relocation != null && relocationText != null ? (
          <>
            <Ariakit.MenuHeading render={<div />} className={headingClasses}>
              {localize('com_ui_code_workspace_move')}
            </Ariakit.MenuHeading>
            <p className="px-2.5 pb-2 text-xs text-text-secondary">{relocationText.info}</p>
            {relocation.targets.map(({ environment, workspaces }) => (
              <div key={environment.id}>
                <Ariakit.MenuHeading render={<div />} className={headingClasses}>
                  {environment.name ?? environment.id}
                </Ariakit.MenuHeading>
                {workspaces.map((descriptor) => (
                  <Ariakit.MenuItem
                    key={descriptor.id}
                    hideOnClick={true}
                    onClick={() =>
                      moveToWorkspace(relocation, {
                        environmentId: environment.id,
                        workspaceId: descriptor.id,
                      })
                    }
                    className={menuItemClasses()}
                  >
                    <FolderSync
                      className="mt-0.5 size-4 shrink-0 text-text-secondary"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {localize('com_ui_code_workspace_move_item', {
                          0: descriptor.name ?? descriptor.id,
                        })}
                      </div>
                      {descriptor.name && (
                        <p className="truncate text-xs text-text-secondary">{descriptor.id}</p>
                      )}
                    </div>
                  </Ariakit.MenuItem>
                ))}
              </div>
            ))}
          </>
        ) : (
          <>
            <Ariakit.MenuHeading render={<div />} className={headingClasses}>
              {localize('com_ui_code_environment')}
            </Ariakit.MenuHeading>
            {workspace.supportsEnvironmentDecisions && (
              <Ariakit.MenuItemRadio
                name="codeEnvironmentMode"
                value="without_attached"
                checked={workspace.mode === 'without_attached'}
                hideOnClick={true}
                onChange={selectWithoutAttached}
                className={menuItemClasses(workspace.mode === 'without_attached')}
              >
                <FolderX
                  className="mt-0.5 size-4 shrink-0 text-text-secondary"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {localize('com_ui_code_workspace_without_attached')}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {localize('com_ui_code_workspace_without_attached_info')}
                  </p>
                </div>
                {workspace.mode === 'without_attached' && (
                  <Check className="mt-0.5 size-4 shrink-0 text-text-primary" aria-hidden="true" />
                )}
              </Ariakit.MenuItemRadio>
            )}
            {workspace.environments.map(({ environment, state, workspaces, selected }) => (
              <div key={environment.id}>
                <Ariakit.MenuHeading render={<div />} className={headingClasses}>
                  {environment.name ?? environment.id}
                </Ariakit.MenuHeading>
                {workspaces.length === 0 && (
                  <div className="px-2.5 py-2 text-sm text-text-secondary">
                    {localize(stateLabels[state] ?? 'com_ui_code_workspace_unavailable')}
                  </div>
                )}
                {workspaces.map((descriptor) => {
                  const isSelected =
                    workspace.mode === 'attached' && descriptor.id === selected?.workspaceId;
                  return (
                    <Ariakit.MenuItemRadio
                      key={descriptor.id}
                      name={`codeWorkspace:${environment.id}`}
                      value={descriptor.id}
                      checked={isSelected}
                      hideOnClick={true}
                      onChange={() =>
                        selectWorkspace({
                          environmentId: environment.id,
                          workspaceId: descriptor.id,
                        })
                      }
                      className={menuItemClasses(isSelected)}
                    >
                      <Folder
                        className="mt-0.5 size-4 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {descriptor.name ?? descriptor.id}
                        </div>
                        {descriptor.name && (
                          <p className="truncate text-xs text-text-secondary">{descriptor.id}</p>
                        )}
                      </div>
                      {isSelected && (
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-text-primary"
                          aria-hidden="true"
                        />
                      )}
                    </Ariakit.MenuItemRadio>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
}
