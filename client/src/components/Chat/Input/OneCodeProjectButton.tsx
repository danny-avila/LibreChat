import React, { useCallback, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import {
  FolderOpen,
  FolderPlus,
  Link2,
  ListChecks,
  PanelRightOpen,
  Play,
  RotateCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DropdownPopup, TooltipAnchor } from '@librechat/client';
import type { MenuItemProps } from '~/common';
import {
  clearStoredOneCodeWorkspace,
  createOneCodeProjectFolder,
  getStoredOneCodeRecentProjects,
  getWorkspaceBasename,
  getOneCodeProjectStatus,
  initOneCodeProject,
  inspectOneCodeRun,
  latestRunActionLabel,
  listOneCodeRuns,
  normalizeOneCodeWorkspace,
  pickOneCodeProjectFolder,
  projectStatusBadges,
  resumeOneCodeRun,
  setStoredOneCodeWorkspace,
  syncOneCodeFilesystemMCP,
  type OneCodeProjectStatus,
  type OneCodeRunSummary,
} from '~/onecode/project';
import { useOneCodeWorkspace } from '~/onecode/workspace';
import { openOneCodeConsole } from '~/onecode/console';
import { cn } from '~/utils';

const selectWorkspaceFromPrompt = () => {
  const value = window.prompt('OneCode 项目文件夹绝对路径');
  return normalizeOneCodeWorkspace(value);
};

const createWorkspaceFromPrompt = () => {
  const value = window.prompt('新项目文件夹绝对路径');
  return normalizeOneCodeWorkspace(value);
};

const createProjectNameFromPrompt = () => {
  const value = window.prompt('新项目名称');
  return normalizeOneCodeWorkspace(value);
};

const OneCodeProjectButton = ({ disabled = false }: { disabled?: boolean }) => {
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const workspace = useOneCodeWorkspace();
  const [recentProjects, setRecentProjects] = useState(() => getStoredOneCodeRecentProjects());
  const [mcpStatus, setMcpStatus] = useState<'idle' | 'syncing' | 'ready' | 'error'>('idle');
  const [projectStatus, setProjectStatus] = useState<OneCodeProjectStatus | undefined>();
  const [runs, setRuns] = useState<OneCodeRunSummary[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  const refreshProjectStatus = useCallback(
    async (targetWorkspace = workspace) => {
      const normalized = normalizeOneCodeWorkspace(targetWorkspace);
      if (!normalized) {
        setProjectStatus(undefined);
        setRuns([]);
        return;
      }
      try {
        const [status, recentRuns] = await Promise.all([
          getOneCodeProjectStatus(normalized),
          listOneCodeRuns(normalized, 5),
        ]);
        setProjectStatus(status);
        setRuns(recentRuns);
        setStatusMessage('');
      } catch {
        setStatusMessage('OneCode 状态不可用');
      }
    },
    [workspace],
  );

  const selectWorkspace = useCallback(
    (nextWorkspace: string) => {
      const normalized = normalizeOneCodeWorkspace(nextWorkspace);
      if (!normalized) {
        return;
      }
      setRecentProjects(setStoredOneCodeWorkspace(normalized));
      setMcpStatus('syncing');
      void syncOneCodeFilesystemMCP(normalized)
        .then(() => {
          setMcpStatus('ready');
          void refreshProjectStatus(normalized);
        })
        .catch(() => {
          setMcpStatus('error');
          void refreshProjectStatus(normalized);
        });
    },
    [refreshProjectStatus],
  );

  const clearWorkspace = useCallback(() => {
    clearStoredOneCodeWorkspace();
    setMcpStatus('idle');
    setProjectStatus(undefined);
    setRuns([]);
    setStatusMessage('');
  }, []);

  const selectExistingWorkspace = useCallback(async () => {
    try {
      const result = await pickOneCodeProjectFolder();
      if (result.cancelled) {
        return;
      }
      selectWorkspace(result.workspace ?? '');
    } catch {
      selectWorkspace(selectWorkspaceFromPrompt());
    }
  }, [selectWorkspace]);

  const createWorkspace = useCallback(async () => {
    const projectName = createProjectNameFromPrompt();
    if (!projectName) {
      return;
    }
    try {
      const result = await createOneCodeProjectFolder(projectName);
      if (result.cancelled) {
        return;
      }
      selectWorkspace(result.workspace ?? '');
    } catch {
      selectWorkspace(createWorkspaceFromPrompt());
    }
  }, [selectWorkspace]);

  const initializeProject = useCallback(() => {
    if (!workspace) {
      return;
    }
    setStatusMessage('正在初始化项目');
    void initOneCodeProject(workspace)
      .then((status) => {
        setProjectStatus(status);
        setStatusMessage('项目已初始化');
      })
      .catch(() => setStatusMessage('项目初始化失败'));
  }, [workspace]);

  const refreshRuns = useCallback(() => {
    if (!workspace) {
      return;
    }
    setStatusMessage('正在刷新运行记录');
    void listOneCodeRuns(workspace, 5)
      .then((recentRuns) => {
        setRuns(recentRuns);
        setStatusMessage(recentRuns.length > 0 ? '运行记录已刷新' : '暂无运行记录');
      })
      .catch(() => setStatusMessage('运行记录不可用'));
  }, [workspace]);

  const latestRun = runs[runs.length - 1] ?? projectStatus?.latest_run ?? null;

  const inspectLatestRun = useCallback(() => {
    if (!workspace || !latestRun?.run_id) {
      return;
    }
    setStatusMessage('正在检查最新运行');
    void inspectOneCodeRun(workspace, latestRun.run_id)
      .then((result) => {
        setStatusMessage(result ? `${result.run_id}: ${result.status}` : '运行检查不可用');
      })
      .catch(() => setStatusMessage('运行检查失败'));
  }, [latestRun?.run_id, workspace]);

  const continueLatestRun = useCallback(() => {
    if (!workspace || !latestRun?.run_id || latestRun.next_action !== 'resume') {
      return;
    }
    setStatusMessage('正在继续最新运行');
    void resumeOneCodeRun(workspace, latestRun.run_id, '继续完成上次运行')
      .then(() => {
        setStatusMessage('已提交继续运行');
        void refreshProjectStatus(workspace);
      })
      .catch(() => setStatusMessage('继续运行失败'));
  }, [latestRun?.next_action, latestRun?.run_id, refreshProjectStatus, workspace]);

  const badges = projectStatusBadges(projectStatus);

  const dropdownItems = useMemo<MenuItemProps[]>(() => {
    const items: MenuItemProps[] = [
      {
        id: 'onecode-current-project',
        hideOnClick: false,
        disabled: true,
        render: (props) => (
          <div {...props} className="cursor-default px-3 py-2 text-left">
            <div className="text-xs font-medium text-text-secondary">当前项目</div>
            <div className="mt-1 flex max-w-72 items-center gap-2">
              <span className="truncate text-sm font-medium text-text-primary">
                {getWorkspaceBasename(workspace)}
              </span>
              {workspace && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] uppercase leading-none',
                    mcpStatus === 'ready' && 'bg-surface-active text-text-primary',
                    mcpStatus === 'syncing' && 'bg-surface-active text-text-warning',
                    mcpStatus === 'error' && 'bg-surface-destructive/10 text-text-destructive',
                    mcpStatus === 'idle' && 'bg-surface-hover text-text-secondary',
                  )}
                >
                  {mcpStatus === 'ready'
                    ? 'MCP 已绑定'
                    : mcpStatus === 'syncing'
                      ? 'MCP 同步中'
                      : mcpStatus === 'error'
                        ? 'MCP 未同步'
                        : 'MCP'}
                </span>
              )}
            </div>
            {workspace && (
              <div className="mt-1 max-w-80 truncate text-xs text-text-secondary">{workspace}</div>
            )}
            {badges.length > 0 && (
              <div className="mt-2 flex max-w-80 flex-wrap gap-1">
                {badges.map((badge) => (
                  <span
                    key={badge.label}
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] leading-none',
                      badge.kind === 'ok' && 'bg-surface-active text-text-primary',
                      badge.kind === 'warn' && 'bg-surface-active text-text-warning',
                      badge.kind === 'error' && 'bg-surface-destructive/10 text-text-destructive',
                    )}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
            {latestRun && (
              <div className="mt-2 max-w-80 truncate text-xs text-text-secondary">
                最新运行 {latestRun.run_id}: {latestRun.status}
              </div>
            )}
            {statusMessage && (
              <div className="mt-2 max-w-80 truncate text-xs text-text-secondary">
                {statusMessage}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'onecode-select-project',
        label: '使用现有文件夹',
        icon: <FolderOpen className="icon-md" />,
        onClick: selectExistingWorkspace,
      },
      {
        id: 'onecode-create-project',
        label: '新建空白项目',
        icon: <FolderPlus className="icon-md" />,
        onClick: createWorkspace,
      },
      {
        id: 'onecode-open-console',
        label: '打开控制台',
        icon: <PanelRightOpen className="icon-md" />,
        onClick: () => openOneCodeConsole(),
      },
    ];

    if (workspace) {
      items.push({
        id: 'onecode-refresh-status',
        label: '刷新项目状态',
        icon: <RotateCw className="icon-md" />,
        onClick: () => void refreshProjectStatus(workspace),
      });
      items.push({
        id: 'onecode-init-project',
        label: '初始化项目验证',
        icon: <ShieldCheck className="icon-md" />,
        onClick: initializeProject,
      });
      items.push({
        id: 'onecode-sync-mcp',
        label: '同步文件 MCP',
        icon: <Link2 className="icon-md" />,
        onClick: () => {
          setMcpStatus('syncing');
          void syncOneCodeFilesystemMCP(workspace)
            .then(() => {
              setMcpStatus('ready');
              void refreshProjectStatus(workspace);
            })
            .catch(() => setMcpStatus('error'));
        },
      });
      items.push({
        id: 'onecode-refresh-runs',
        label: '查看最近运行',
        icon: <ListChecks className="icon-md" />,
        onClick: refreshRuns,
      });
      if (latestRun) {
        items.push({
          id: 'onecode-inspect-latest-run',
          label: latestRunActionLabel(latestRun),
          icon: <Play className="icon-md" />,
          onClick: latestRun.next_action === 'resume' ? continueLatestRun : inspectLatestRun,
        });
      }
      items.push({
        id: 'onecode-clear-project',
        label: '取消绑定项目',
        icon: <X className="icon-md" />,
        onClick: clearWorkspace,
      });
    }

    const recents = recentProjects.filter((item) => item !== workspace);
    if (recents.length > 0) {
      items.push({ separate: true });
      recents.forEach((recent) => {
        items.push({
          id: `onecode-recent-${recent}`,
          label: recent,
          icon: <FolderOpen className="icon-md" />,
          className: 'max-w-80',
          onClick: () => selectWorkspace(recent),
        });
      });
    }

    return items;
  }, [
    badges,
    clearWorkspace,
    continueLatestRun,
    createWorkspace,
    initializeProject,
    inspectLatestRun,
    latestRun,
    mcpStatus,
    recentProjects,
    refreshProjectStatus,
    refreshRuns,
    selectExistingWorkspace,
    selectWorkspace,
    statusMessage,
    workspace,
  ]);

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          aria-label="OneCode 项目"
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
            workspace && 'text-text-primary',
          )}
        >
          <div className="flex w-full items-center justify-center gap-2">
            <FolderOpen className="size-5" aria-hidden="true" />
            {workspace && (
              <span
                className={cn(
                  'absolute right-1.5 top-1.5 size-2 rounded-full',
                  mcpStatus === 'ready' && 'bg-surface-submit',
                  mcpStatus === 'syncing' && 'bg-text-warning',
                  mcpStatus === 'error' && 'bg-surface-destructive',
                  mcpStatus === 'idle' && 'bg-text-secondary',
                )}
                aria-hidden="true"
              />
            )}
          </div>
        </Ariakit.MenuButton>
      }
      id="onecode-project-button"
      description={
        workspace
          ? `OneCode 项目：${getWorkspaceBasename(workspace)} - ${workspace}`
          : 'OneCode 项目'
      }
      disabled={disabled}
    />
  );

  return (
    <DropdownPopup
      itemClassName="flex w-full cursor-pointer rounded-lg items-center gap-2 hover:bg-surface-hover"
      menuId="onecode-project-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={true}
      unmountOnHide={true}
      trigger={menuTrigger}
      items={dropdownItems}
      iconClassName="mr-0"
    />
  );
};

export default React.memo(OneCodeProjectButton);
