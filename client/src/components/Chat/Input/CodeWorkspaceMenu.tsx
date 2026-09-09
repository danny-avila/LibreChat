import { useEffect } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, ChevronDown, Folder, FolderX } from 'lucide-react';
import { TooltipAnchor, composerControlClasses } from '@librechat/client';
import type { CodeWorkspaceSelection, TConversation } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import type { CodeWorkspaceResult, TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const stateLabels: Partial<Record<CodeWorkspaceResult['state'], TranslationKeys>> = {
  loading: 'com_ui_code_workspace_loading',
  choose: 'com_ui_code_workspace_choose',
  missing: 'com_ui_code_workspace_missing',
  unavailable: 'com_ui_code_workspace_unavailable',
  unsupported: 'com_ui_code_workspace_unsupported',
};

export default function CodeWorkspaceMenu({
  conversation,
  setConversation,
  workspace,
  disabled,
}: {
  conversation: TConversation | null;
  setConversation: SetterOrUpdater<TConversation | null>;
  workspace: CodeWorkspaceResult;
  disabled: boolean;
}) {
  const localize = useLocalize();
  const menuStore = Ariakit.useMenuStore({ focusLoop: true, placement: 'top-start' });
  const isOpen = menuStore.useState('open');

  /** A single advertised root per reachable environment is an unambiguous
   * initial choice. Once a conversation owns any binding, even a partial or
   * stale set, only explicit user actions may replace or complete it. */
  useEffect(() => {
    if (conversation?.codeWorkspaces != null || workspace.selections == null) return;
    setConversation((current) =>
      current == null || current.codeWorkspaces != null
        ? current
        : { ...current, codeWorkspaces: workspace.selections },
    );
  }, [conversation?.codeWorkspaces, setConversation, workspace.selections]);

  if (!workspace.required) return null;

  const environmentIds = new Set(workspace.environments.map(({ environment }) => environment.id));
  const selectWorkspace = (selection: CodeWorkspaceSelection) => {
    setConversation((current) => {
      if (current == null) return current;
      const retained = (current.codeWorkspaces ?? []).filter(
        ({ environmentId }) =>
          environmentIds.has(environmentId) && environmentId !== selection.environmentId,
      );
      return {
        ...current,
        codeWorkspaces: [...retained, selection].sort((a, b) =>
          a.environmentId.localeCompare(b.environmentId),
        ),
      };
    });
  };
  const onlyEnvironment = workspace.environments.length === 1 ? workspace.environments[0] : null;
  const onlyDescriptor = onlyEnvironment?.workspaces.find(
    ({ id }) => id === onlyEnvironment.selected?.workspaceId,
  );
  const labelKey = stateLabels[workspace.state];
  let label = onlyDescriptor?.name ?? onlyDescriptor?.id;
  if (label == null && workspace.state === 'ready') {
    label = localize('com_ui_code_workspaces_selected', {
      0: workspace.selections?.length ?? 0,
    });
  } else if (label == null) {
    label = labelKey ? localize(labelKey) : localize('com_ui_code_workspace_choose');
  }
  const canChoose = workspace.environments.some(({ workspaces }) => workspaces.length > 0);
  const Icon =
    workspace.state === 'missing' || workspace.state === 'unavailable' ? FolderX : Folder;

  return (
    <Ariakit.MenuProvider store={menuStore}>
      <TooltipAnchor
        description={localize('com_ui_code_workspace')}
        disabled={isOpen}
        render={
          <Ariakit.MenuButton
            disabled={disabled || !canChoose}
            data-testid="code-workspace"
            aria-label={`${localize('com_ui_code_workspace')}: ${label}`}
            className={cn(
              composerControlClasses(),
              'px-2.5 md:px-theme-normal',
              isOpen && 'bg-surface-hover',
              (disabled || !canChoose) && 'cursor-not-allowed opacity-50',
            )}
          />
        }
      >
        <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
        <span className="max-w-[12rem] truncate">{label}</span>
        {canChoose && (
          <ChevronDown
            className={cn(
              'size-3 shrink-0 text-text-secondary transition-transform',
              isOpen && 'rotate-180',
            )}
            aria-hidden="true"
          />
        )}
      </TooltipAnchor>
      {canChoose && (
        <Ariakit.Menu
          portal={true}
          gutter={8}
          unmountOnHide={true}
          className={cn(
            'z-50 flex min-w-[280px] max-w-[min(360px,calc(100vw-2rem))] flex-col rounded-xl',
            'border border-border-light bg-presentation p-1.5 shadow-lg',
            'origin-bottom opacity-0 transition-[opacity,transform] duration-200 ease-out',
            'data-[enter]:scale-100 data-[enter]:opacity-100',
            'scale-95 data-[leave]:scale-95 data-[leave]:opacity-0',
          )}
        >
          {workspace.environments.map(({ environment, state, workspaces, selected }) => (
            <div key={environment.id}>
              <Ariakit.MenuHeading
                render={<div />}
                className="px-2.5 py-1.5 text-xs font-medium text-text-secondary"
              >
                {environment.name ?? environment.id}
              </Ariakit.MenuHeading>
              {workspaces.length === 0 && (
                <div className="px-2.5 py-2 text-sm text-text-secondary">
                  {localize(stateLabels[state] ?? 'com_ui_code_workspace_unavailable')}
                </div>
              )}
              {workspaces.map((descriptor) => {
                const isSelected = descriptor.id === selected?.workspaceId;
                return (
                  <Ariakit.MenuItemRadio
                    key={descriptor.id}
                    name={`codeWorkspace:${environment.id}`}
                    value={descriptor.id}
                    checked={isSelected}
                    hideOnClick={true}
                    onChange={() =>
                      selectWorkspace({ environmentId: environment.id, workspaceId: descriptor.id })
                    }
                    className={cn(
                      'group flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2',
                      'outline-none transition-colors duration-theme-fast',
                      'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
                      isSelected && 'bg-surface-active-alt',
                    )}
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
        </Ariakit.Menu>
      )}
    </Ariakit.MenuProvider>
  );
}
