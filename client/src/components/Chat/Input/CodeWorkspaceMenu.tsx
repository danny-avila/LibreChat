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

  /** A single advertised root is an unambiguous initial choice. Once a
   * conversation owns any binding, even a stale one, only an explicit user
   * action may replace it. */
  useEffect(() => {
    if (conversation?.codeWorkspace != null || workspace.selected == null) return;
    setConversation((current) =>
      current == null || current.codeWorkspace != null
        ? current
        : { ...current, codeWorkspace: workspace.selected },
    );
  }, [conversation?.codeWorkspace, setConversation, workspace.selected]);

  if (!workspace.required) return null;

  const selectWorkspace = (selection: CodeWorkspaceSelection) => {
    setConversation((current) =>
      current == null ? current : { ...current, codeWorkspace: selection },
    );
  };
  const selectedDescriptor = workspace.workspaces.find(
    ({ id }) => id === workspace.selected?.workspaceId,
  );
  const labelKey = stateLabels[workspace.state];
  const label =
    selectedDescriptor?.name ??
    selectedDescriptor?.id ??
    (labelKey ? localize(labelKey) : localize('com_ui_code_workspace_choose'));
  const canChoose = workspace.workspaces.length > 0 && workspace.environment != null;
  const environmentId = workspace.environment?.id;
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
          <Ariakit.MenuHeading
            render={<div />}
            className="px-2.5 py-1.5 text-xs font-medium text-text-secondary"
          >
            {localize('com_ui_code_workspace')}
            {workspace.environment?.name ? ` · ${workspace.environment.name}` : ''}
          </Ariakit.MenuHeading>
          {workspace.workspaces.map((descriptor) => {
            const isSelected = descriptor.id === workspace.selected?.workspaceId;
            return (
              <Ariakit.MenuItemRadio
                key={descriptor.id}
                name="codeWorkspace"
                value={descriptor.id}
                checked={isSelected}
                hideOnClick={true}
                onChange={() => {
                  if (environmentId != null) {
                    selectWorkspace({ environmentId, workspaceId: descriptor.id });
                  }
                }}
                className={cn(
                  'group flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2',
                  'outline-none transition-colors duration-theme-fast',
                  'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
                  isSelected && 'bg-surface-active-alt',
                )}
              >
                <Folder className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {descriptor.name ?? descriptor.id}
                  </div>
                  {descriptor.name && (
                    <p className="truncate text-xs text-text-secondary">{descriptor.id}</p>
                  )}
                </div>
                {isSelected && (
                  <Check className="mt-0.5 size-4 shrink-0 text-text-primary" aria-hidden="true" />
                )}
              </Ariakit.MenuItemRadio>
            );
          })}
        </Ariakit.Menu>
      )}
    </Ariakit.MenuProvider>
  );
}
