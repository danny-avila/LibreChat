import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  getOneCodeProjectStatus,
  getOneCodeRunEvidence,
  getOneCodeModelConfig,
  getOneCodeVerifierPolicy,
  getOneCodeVerifierPresets,
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
import { useOneCodeWorkspace } from '~/onecode/workspace';
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
  const workspace = useOneCodeWorkspace();
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
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const evidenceRequest = useRef(0);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (actionPending.current) {
      return;
    }
    actionPending.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'OneCode 请求失败');
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }, []);

  const refreshProject = useCallback(async () => {
    if (!workspace) {
      setProjectStatus(undefined);
      setRuns([]);
      setSelectedRunId('');
      setEvidence(undefined);
      return;
    }
    try {
      const status = await getOneCodeProjectStatus(workspace);
      setProjectStatus(status);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '项目状态不可用');
    }
  }, [workspace]);

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
    const request = ++evidenceRequest.current;
    try {
      const result = await getOneCodeRunEvidence(workspace, selectedRunId);
      if (request === evidenceRequest.current) {
        setEvidence(result);
        setTab('evidence');
      }
    } catch (error) {
      if (request === evidenceRequest.current) {
        setMessage(error instanceof Error ? error.message : '证据不可用');
      }
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
    evidenceRequest.current += 1;
    setProjectStatus(undefined);
    setRuns([]);
    setSelectedRunId('');
    setEvidence(undefined);
    setMessage(workspace ? '' : '未选择项目');
  }, [workspace]);

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
          void runAction(async () => {
            const result = await initOneCodeProject(workspace);
            setProjectStatus(result);
          });
        }}
        onSyncMCP={() => {
          if (!workspace) {
            return;
          }
          void runAction(async () => {
            await syncOneCodeFilesystemMCP(workspace);
            setMessage('MCP 已同步');
          });
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
          evidenceRequest.current += 1;
          const request = evidenceRequest.current;
          void runAction(async () => {
            const result = await getOneCodeRunEvidence(workspace, run.run_id);
            if (request === evidenceRequest.current) {
              setEvidence(result);
              setTab('evidence');
            }
          });
        }}
        onResume={(run) => {
          void runAction(async () => {
            await resumeOneCodeRun(workspace, run.run_id, '继续完成上次运行');
            await refreshRuns();
          });
        }}
      />
    ),
    model: (
      <ModelConfigTab
        config={modelConfig}
        message={tab === 'model' ? message : ''}
        onLoad={loadModelConfig}
        onDiscover={(input) => {
          void runAction(async () => {
            const result = await discoverOneCodeModels(input);
            setModelConfig(result);
            setMessage(result.source === 'fallback' ? '模型列表使用内置候选项' : '模型列表已更新');
          });
        }}
        onSave={(input) => {
          void runAction(async () => {
            const result = await writeOneCodeModelConfig(input);
            setModelConfig(result);
            setMessage('模型配置已保存');
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
          void runAction(async () => {
            setPolicy(await writeOneCodeVerifierPolicy(workspace, undefined, false));
          });
        }}
        onOverwriteDefault={() => {
          if (!workspace) {
            return;
          }
          void runAction(async () => {
            setPolicy(await writeOneCodeVerifierPolicy(workspace, undefined, true));
          });
        }}
      />
    ),
    diagnostics: (
      <DiagnosticsTab
        doctor={doctor}
        selfAudit={selfAudit}
        onDoctor={() => void runAction(async () => setDoctor(await runOneCodeDoctor()))}
        onSelfAudit={() => void runAction(async () => setSelfAudit(await runOneCodeSelfAudit()))}
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
      {message && (
        <div role="status" aria-live="polite" className="border-b border-border-light px-3 py-2 text-xs text-text-secondary">
          {message}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={busy}>
        <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
          {content[tab]}
        </fieldset>
      </div>
    </aside>
  );
}
