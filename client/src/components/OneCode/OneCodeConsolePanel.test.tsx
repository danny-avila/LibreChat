import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('~/onecode/project', () => ({
  getStoredOneCodeWorkspace: jest.fn(),
  getWorkspaceBasename: jest.fn(
    (workspace: string) => workspace.split('/').filter(Boolean).pop() || '未选择',
  ),
  getOneCodeProjectStatus: jest.fn(),
  initOneCodeProject: jest.fn(),
  syncOneCodeFilesystemMCP: jest.fn(),
  listOneCodeRuns: jest.fn(),
  inspectOneCodeRun: jest.fn(),
  resumeOneCodeRun: jest.fn(),
  getOneCodeRunEvidence: jest.fn(),
  getOneCodeModelConfig: jest.fn(),
  discoverOneCodeModels: jest.fn(),
  writeOneCodeModelConfig: jest.fn(),
  getOneCodeVerifierPresets: jest.fn(),
  getOneCodeVerifierPolicy: jest.fn(),
  writeOneCodeVerifierPolicy: jest.fn(),
  runOneCodeDoctor: jest.fn(),
  runOneCodeSelfAudit: jest.fn(),
}));

import OneCodeConsolePanel from './OneCodeConsolePanel';

const mockProject = jest.requireMock('~/onecode/project');

describe('OneCodeConsolePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProject.getStoredOneCodeWorkspace.mockReturnValue('/tmp/project');
    mockProject.getOneCodeProjectStatus.mockResolvedValue({
      workspace: '/tmp/project',
      exists: true,
      allowed: true,
      git: { present: true },
      verifier_policy: { present: true },
    });
    mockProject.listOneCodeRuns.mockResolvedValue([{ run_id: 'run-1', status: 'completed' }]);
    mockProject.getOneCodeModelConfig.mockResolvedValue({
      configured: true,
      endpoint: 'http://localhost:6780/v1/chat/completions',
      model: 'gpt-5.5',
      api_key_preview: 'sk-t...cret',
      models: ['gpt-5.5', 'gpt-4.1'],
    });
    mockProject.getOneCodeVerifierPresets.mockResolvedValue([]);
    mockProject.getOneCodeVerifierPolicy.mockResolvedValue({
      workspace: '/tmp/project',
      exists: true,
      valid: true,
      path: '/tmp/project/.onecode/verifier-policy.json',
      policy: { verifiers: [] },
    });
  });

  it('renders project status and loads runs', async () => {
    render(<OneCodeConsolePanel onClose={jest.fn()} />);

    expect((await screen.findAllByText('/tmp/project')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '运行' }));

    expect(await screen.findByText('run-1')).toBeInTheDocument();
  });

  it('runs diagnostics actions from the diagnostics tab', async () => {
    mockProject.runOneCodeDoctor.mockResolvedValue({ status: 'ok', checks: [] });

    render(<OneCodeConsolePanel onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '诊断' }));
    fireEvent.click(await screen.findByRole('button', { name: '运行 doctor' }));

    expect(await screen.findByText('doctor: ok')).toBeInTheDocument();
  });

  it('shows the model config tab and current selected model', async () => {
    render(<OneCodeConsolePanel onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '模型' }));

    expect(
      await screen.findByDisplayValue('http://localhost:6780/v1/chat/completions'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('gpt-5.5')).toBeInTheDocument();
    expect(screen.getByText('已保存密钥: sk-t...cret')).toBeInTheDocument();
  });
});
