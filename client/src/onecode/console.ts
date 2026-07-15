export const ONECODE_CONSOLE_TABS = [
  'project',
  'model',
  'runs',
  'evidence',
  'verifier',
  'diagnostics',
] as const;

export type OneCodeConsoleTab = (typeof ONECODE_CONSOLE_TABS)[number];

export const ONECODE_CONSOLE_TAB_LABELS: Record<OneCodeConsoleTab, string> = {
  project: '项目',
  model: '模型',
  runs: '运行',
  evidence: '证据',
  verifier: '验证',
  diagnostics: '诊断',
};

export const ONECODE_CONSOLE_OPEN_EVENT = 'onecode:console-open';

export type OneCodeConsoleOpenDetail = {
  tab?: OneCodeConsoleTab;
};

export function oneCodeStatusTone(status?: string | null): 'ok' | 'warn' | 'error' {
  if (status === 'completed' || status === 'ok' || status === 'deliverable') {
    return 'ok';
  }
  if (status === 'halted' || status === 'failed' || status === 'corrupt') {
    return 'error';
  }
  return 'warn';
}

export function openOneCodeConsole(tab?: OneCodeConsoleTab): void {
  window.dispatchEvent(
    new CustomEvent<OneCodeConsoleOpenDetail>(ONECODE_CONSOLE_OPEN_EVENT, { detail: { tab } }),
  );
}
