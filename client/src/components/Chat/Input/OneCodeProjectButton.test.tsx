import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const mockProjectState = {
  workspace: '',
  recents: [] as string[],
};

jest.mock('~/onecode/project', () => ({
  clearStoredOneCodeWorkspace: jest.fn(() => {
    mockProjectState.workspace = '';
  }),
  createOneCodeProjectFolder: jest.fn(),
  getStoredOneCodeRecentProjects: jest.fn(() => mockProjectState.recents),
  getStoredOneCodeWorkspace: jest.fn(() => mockProjectState.workspace),
  getWorkspaceBasename: jest.fn(
    (workspace: string) => workspace.split('/').filter(Boolean).pop() || '未选择',
  ),
  getOneCodeProjectStatus: jest.fn(),
  initOneCodeProject: jest.fn(),
  inspectOneCodeRun: jest.fn(),
  latestRunActionLabel: jest.fn((run) =>
    run?.next_action === 'resume' ? '继续最新运行' : '查看最新运行',
  ),
  listOneCodeRuns: jest.fn(),
  normalizeOneCodeWorkspace: jest.fn((value) => String(value ?? '').trim()),
  pickOneCodeProjectFolder: jest.fn(),
  projectStatusBadges: jest.fn((status) => {
    if (!status) {
      return [];
    }
    return [{ kind: 'ok', label: '已允许' }];
  }),
  resumeOneCodeRun: jest.fn(),
  setStoredOneCodeWorkspace: jest.fn((workspace: string) => {
    mockProjectState.workspace = workspace;
    mockProjectState.recents = [workspace];
    return mockProjectState.recents;
  }),
  syncOneCodeFilesystemMCP: jest.fn(),
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    TooltipAnchor: (props) => props.render,
    DropdownPopup: (props) =>
      R.createElement(
        'div',
        null,
        R.createElement('div', { onClick: () => props.setIsOpen(!props.isOpen) }, props.trigger),
        props.isOpen &&
          R.createElement(
            'div',
            { 'data-testid': 'onecode-menu' },
            props.items.map((item, idx) => {
              if (item.separate) {
                return R.createElement('hr', { key: idx });
              }
              if (item.render) {
                return R.createElement('div', { key: idx }, item.render({}));
              }
              return R.createElement(
                'button',
                { key: idx, onClick: item.onClick, disabled: item.disabled },
                item.label,
              );
            }),
          ),
      ),
  };
});

jest.mock('@ariakit/react', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    MenuButton: (props) => R.createElement('button', props, props.children),
  };
});

import OneCodeProjectButton from './OneCodeProjectButton';
import { ONECODE_CONSOLE_OPEN_EVENT } from '~/onecode/console';

const mockProject = jest.requireMock('~/onecode/project');

describe('OneCodeProjectButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectState.workspace = '';
    mockProjectState.recents = [];
    mockProject.pickOneCodeProjectFolder.mockResolvedValue({ workspace: '/tmp/onecode-demo' });
    mockProject.syncOneCodeFilesystemMCP.mockResolvedValue({
      serverName: 'onecode-filesystem',
      status: 'created',
    });
    mockProject.getOneCodeProjectStatus.mockResolvedValue({
      workspace: '/tmp/onecode-demo',
      exists: true,
      allowed: true,
      latest_run: { run_id: 'run-1', status: 'completed' },
    });
    mockProject.listOneCodeRuns.mockResolvedValue([{ run_id: 'run-1', status: 'completed' }]);
  });

  it('selects an existing folder and refreshes OneCode project state', async () => {
    render(<OneCodeProjectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'OneCode 项目' }));
    fireEvent.click(screen.getByText('使用现有文件夹'));

    await waitFor(() => {
      expect(mockProject.setStoredOneCodeWorkspace).toHaveBeenCalledWith('/tmp/onecode-demo');
      expect(mockProject.syncOneCodeFilesystemMCP).toHaveBeenCalledWith('/tmp/onecode-demo');
      expect(mockProject.getOneCodeProjectStatus).toHaveBeenCalledWith('/tmp/onecode-demo');
      expect(mockProject.listOneCodeRuns).toHaveBeenCalledWith('/tmp/onecode-demo', 5);
    });

    expect(await screen.findByText('onecode-demo')).toBeInTheDocument();
  });

  it('initializes verification for the active project', async () => {
    mockProjectState.workspace = '/tmp/onecode-demo';
    mockProject.initOneCodeProject.mockResolvedValue({
      workspace: '/tmp/onecode-demo',
      exists: true,
      allowed: true,
      git: { present: true },
      verifier_policy: { present: true },
    });

    render(<OneCodeProjectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'OneCode 项目' }));
    fireEvent.click(screen.getByText('初始化项目验证'));

    await waitFor(() => {
      expect(mockProject.initOneCodeProject).toHaveBeenCalledWith('/tmp/onecode-demo');
      expect(screen.getByText('项目已初始化')).toBeInTheDocument();
    });
  });

  it('opens the OneCode console from the project menu', () => {
    const onOpen = jest.fn();
    window.addEventListener(ONECODE_CONSOLE_OPEN_EVENT, onOpen);

    render(<OneCodeProjectButton />);

    fireEvent.click(screen.getByRole('button', { name: 'OneCode 项目' }));
    fireEvent.click(screen.getByText('打开控制台'));

    expect(onOpen).toHaveBeenCalledTimes(1);
    window.removeEventListener(ONECODE_CONSOLE_OPEN_EVENT, onOpen);
  });
});
