import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  getOneCodeProjectStatus,
  getOneCodeRunEvidence,
  getOneCodeModelConfig,
  getOneCodeVerifierPolicy,
  getOneCodeVerifierPresets,
  getStoredOneCodeWorkspace,
  initOneCodeProject,
  listOneCodeRuns,
  resumeOneCodeRun,
  runOneCodeDoctor,
  runOneCodeSelfAudit,
  syncOneCodeFilesystemMCP,
  discoverOneCodeModels,
  writeOneCodeModelConfig,
  writeOneCodeVerifierPolicy,
  type OneCodeDiagnostic,
  type OneCodeModelConfig,
  type OneCodeProjectStatus,
  type OneCodeRunEvidence,
  type OneCodeRunSummary,
  type OneCodeVerifierPolicy,
  type OneCodeVerifierPreset,
} from '~/onecode/project';
import {
  ONECODE_CONSOLE_TAB_LABELS,
  ONECODE_CONSOLE_TABS,
  type OneCodeConsoleTab,
} from '~/onecode/console';
import { cn } from '~/utils';
import DiagnosticsTab from './DiagnosticsTab';
import EvidenceTab from './EvidenceTab';
import ModelConfigTab from './ModelConfigTab';
import ProjectTab from './ProjectTab';
import RunsTab from './RunsTab';
import VerifierTab from './VerifierTab';

export default function OneCodeConsolePanel({
  initialTab = 'project',
  onClose,
}: {
  initialTab?: OneCodeConsoleTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<OneCodeConsoleTab>(initialTab);
  const [workspace, setWorkspace] = useState(() => getStoredOneCodeWorkspace());
  const [projectStatus, setProjectStatus] = useState<OneCodeProjectStatus | undefined>();
  const [runs, setRuns] = useState<OneCodeRunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [evidence, setEvidence] = useState<OneCodeRunEvidence | undefined>();
  const [presets, setPresets] = useState<OneCodeVerifierPreset[]>([]);
  const [policy, setPolicy] = useState<OneCodeVerifierPolicy | undefined>();
  const [modelConfig, setModelConfig] = useState<OneCodeModelConfig | undefined>();
  const [doctor, setDoctor] = useState<OneCodeDiagnostic | undefined>();
  const [selfAudit, setSelfAudit] = useState<OneCodeDiagnostic | undefined>();
  const [message, setMessage] = useState('');

  const refreshProject = useCallback(async () => {
    const current = getStoredOneCodeWorkspace();
    setWorkspace(current);
    if (!current) {
      setProjectStatus(undefined);
      setRuns([]);
      setMessage('未选择项目');
      return;
    }
    try {
      const status = await getOneCodeProjectStatus(current);
      setProjectStatus(status);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '项目状态不可用');
    }
  }, []);

  const refreshRuns = useCallback(async () => {
    if (!workspace) {
      setRuns([]);
      return;
    }
    try {
      const recentRuns = await listOneCodeRuns(workspace, 20);
      setRuns(recentRuns);
      const latest = recentRuns[recentRuns.length - 1];
      if (latest && !selectedRunId) {
        setSelectedRunId(latest.run_id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '运行记录不可用');
    }
  }, [selectedRunId, workspace]);

  const loadEvidence = useCallback(async () => {
    if (!workspace || !selectedRunId) {
      return;
    }
    try {
      setEvidence(await getOneCodeRunEvidence(workspace, selectedRunId));
      setTab('evidence');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '证据不可用');
    }
  }, [selectedRunId, workspace]);

  const loadVerifier = useCallback(async () => {
    try {
      const [nextPresets, nextPolicy] = await Promise.all([
        getOneCodeVerifierPresets(),
        workspace ? getOneCodeVerifierPolicy(workspace) : Promise.resolve(undefined),
      ]);
      setPresets(nextPresets);
      setPolicy(nextPolicy);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '验证策略不可用');
    }
  }, [workspace]);

  const loadModelConfig = useCallback(async () => {
    try {
      setModelConfig(await getOneCodeModelConfig());
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型配置不可用');
    }
  }, []);

  useEffect(() => {
    void refreshProject();
  }, [refreshProject]);

  useEffect(() => {
    if (tab === 'runs') {
      void refreshRuns();
    }
    if (tab === 'verifier') {
      void loadVerifier();
    }
    if (tab === 'model') {
      void loadModelConfig();
    }
  }, [loadModelConfig, loadVerifier, refreshRuns, tab]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.run_id === selectedRunId),
    [runs, selectedRunId],
  );

  const content = {
    project: (
      <ProjectTab
        workspace={workspace}
        status={projectStatus}
        message={message}
        onRefresh={refreshProject}
        onInit={() => {
          if (!workspace) {
            return;
          }
          void initOneCodeProject(workspace).then(setProjectStatus);
        }}
        onSyncMCP={() => {
          if (!workspace) {
            return;
          }
          void syncOneCodeFilesystemMCP(workspace).then(() => setMessage('MCP 已同步'));
        }}
      />
    ),
    runs: (
      <RunsTab
        runs={runs}
        selectedRunId={selectedRunId}
        onSelect={(run) => setSelectedRunId(run.run_id)}
        onInspect={(run) => {
          setSelectedRunId(run.run_id);
          void getOneCodeRunEvidence(workspace, run.run_id).then((result) => {
            setEvidence(result);
            setTab('evidence');
          });
        }}
        onResume={(run) => {
          void resumeOneCodeRun(workspace, run.run_id, '继续完成上次运行').then(() =>
            refreshRuns(),
          );
        }}
      />
    ),
    model: (
      <ModelConfigTab
        config={modelConfig}
        message={tab === 'model' ? message : ''}
        onLoad={loadModelConfig}
        onDiscover={(input) => {
          void discoverOneCodeModels(input)
            .then((result) => {
              setModelConfig(result);
              setMessage(
                result.source === 'fallback' ? '模型列表使用内置候选项' : '模型列表已更新',
              );
            })
            .catch((error) => {
              setMessage(error instanceof Error ? error.message : '模型发现失败');
            });
        }}
        onSave={(input) => {
          void writeOneCodeModelConfig(input)
            .then((result) => {
              setModelConfig(result);
              setMessage('模型配置已保存');
            })
            .catch((error) => {
              setMessage(error instanceof Error ? error.message : '模型配置保存失败');
            });
        }}
      />
    ),
    evidence: (
      <EvidenceTab evidence={evidence} selectedRunId={selectedRunId} onLoad={loadEvidence} />
    ),
    verifier: (
      <VerifierTab
        presets={presets}
        policy={policy}
        onLoad={loadVerifier}
        onWriteDefault={() => {
          if (!workspace) {
            return;
          }
          void writeOneCodeVerifierPolicy(workspace, undefined, false).then(setPolicy);
        }}
        onOverwriteDefault={() => {
          if (!workspace) {
            return;
          }
          void writeOneCodeVerifierPolicy(workspace, undefined, true).then(setPolicy);
        }}
      />
    ),
    diagnostics: (
      <DiagnosticsTab
        doctor={doctor}
        selfAudit={selfAudit}
        onDoctor={() => void runOneCodeDoctor().then(setDoctor)}
        onSelfAudit={() => void runOneCodeSelfAudit().then(setSelfAudit)}
      />
    ),
  } satisfies Record<OneCodeConsoleTab, React.ReactNode>;

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-surface-primary text-text-primary md:min-w-[400px]">
      <div className="flex items-center justify-between border-b border-border-light px-3 py-2">
        <div>
          <div className="text-sm font-semibold">OneCode Console</div>
          <div className="max-w-80 truncate font-mono text-xs text-text-secondary">
            {workspace || '未选择项目'}
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭 OneCode 控制台"
          className="flex size-9 items-center justify-center rounded hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          onClick={onClose}
        >
          <X className="icon-md" />
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-border-light px-2 py-2">
        {ONECODE_CONSOLE_TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={ONECODE_CONSOLE_TAB_LABELS[item]}
            className={cn(
              'shrink-0 rounded px-2 py-1 text-xs hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
              tab === item && 'bg-surface-hover text-text-primary',
            )}
            onClick={() => setTab(item)}
          >
            {ONECODE_CONSOLE_TAB_LABELS[item]}
          </button>
        ))}
      </div>
      {selectedRun && tab === 'evidence' && (
        <div className="border-b border-border-light px-3 py-2 text-xs text-text-secondary">
          当前运行: <span className="font-mono">{selectedRun.run_id}</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{content[tab]}</div>
    </aside>
  );
}
