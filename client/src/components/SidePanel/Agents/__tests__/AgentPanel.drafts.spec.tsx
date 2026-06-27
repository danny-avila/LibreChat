/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { AgentForm, NavLink } from '~/common';
import { ActivePanelProvider, useActivePanel } from '~/Providers/ActivePanelContext';
import Nav from '~/components/SidePanel/Nav';
import AgentPanel from '../AgentPanel';
import { getAgentDraft, saveAgentDraft, clearAllAgentDrafts } from '../drafts';

let mockCurrentAgentId: string | undefined;
let mockLastAgentSelectHasDraft: boolean | undefined;
let mockUserId: string | undefined;

const AGENT_SELECT_LABEL = 'Agent Select';
const ADVANCED_PANEL_LABEL = 'Advanced Panel';
const LOADING_LABEL = 'Loading';
const MODEL_PANEL_LABEL = 'Model Panel';
const SAVE_AGENT_LABEL = 'Save Agent';
const AGENTS_BUTTON_LABEL = 'Agents';
const FILES_BUTTON_LABEL = 'Files';
const FILES_PANEL_LABEL = 'Files panel';
const PROGRAMMATIC_UPDATE_LABEL = 'Programmatic agent update';
const AVATAR_ACTION_LABEL = 'Avatar action';
const RESET_AVATAR_LABEL = 'Reset avatar';
const DELETE_AGENT_LABEL = 'Delete Agent';
const SELECT_AGENT_WITH_DRAFT_LABEL = 'Select agent with draft';
const MOCK_USER_ID = 'user-123';

type MockButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: string;
  variant?: string;
};

type MockAgentSelectProps = {
  hasDraft?: boolean;
  onAgentChange?: (selectedAgentId?: string | null) => void;
};

type MockAgentFooterProps = {
  onDraftClear?: (agentId: string) => void;
};

jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, size: _size, variant: _variant, ...props }: MockButtonProps) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetModelsQuery: () => ({ data: {} }),
}));

jest.mock('~/Providers', () => jest.requireActual('~/Providers/ActivePanelContext'));

jest.mock('~/data-provider', () => ({
  useGetAgentByIdQuery: () => ({
    data: null,
    isInitialLoading: false,
    isSuccess: false,
  }),
  useGetExpandedAgentByIdQuery: () => ({
    data: null,
    isInitialLoading: false,
    isSuccess: false,
  }),
  useCreateAgentMutation: () => ({
    mutate: jest.fn(),
    reset: jest.fn(),
    isLoading: false,
  }),
  useUpdateAgentMutation: () => ({
    mutate: jest.fn(),
    isLoading: false,
  }),
  useUploadAgentAvatarMutation: () => ({
    mutateAsync: jest.fn(),
    isLoading: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useSelectAgent: () => ({ onSelect: jest.fn() }),
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: { id: mockUserId, role: 'USER' } }),
}));

jest.mock('~/hooks/useResourcePermissions', () => ({
  useResourcePermissions: () => ({
    hasPermission: jest.fn(() => true),
    isLoading: false,
  }),
}));

jest.mock('~/Providers/AgentPanelContext', () => ({
  useAgentPanelContext: () => ({
    activePanel: 'builder',
    agentsConfig: { allowedProviders: [] },
    setActivePanel: jest.fn(),
    endpointsConfig: {},
    setCurrentAgentId: jest.fn(),
    agent_id: mockCurrentAgentId,
  }),
}));

jest.mock('~/utils', () => ({
  createProviderOption: jest.fn((provider: string) => ({ value: provider, label: provider })),
  getDefaultAgentFormValues: jest.fn(() => ({
    id: '',
    name: '',
    description: '',
    instructions: '',
    model: '',
    model_parameters: {},
    provider: { value: '', label: '' },
    tools: [],
    tool_options: {},
    category: 'general',
    execute_code: false,
    file_search: false,
    web_search: false,
    avatar_file: null,
    avatar_preview: '',
    avatar_action: null,
  })),
}));

jest.mock('~/common', () => {
  const actual = jest.requireActual('~/common') as typeof import('~/common');

  return {
    ...actual,
    Panel: {
      model: 'model',
      builder: 'builder',
      advanced: 'advanced',
    },
    isEphemeralAgent: (agentId: string | null | undefined): boolean => !agentId,
  };
});

jest.mock('../AgentSelect', () => ({
  __esModule: true,
  default: function MockAgentSelect({ hasDraft, onAgentChange }: MockAgentSelectProps) {
    const { useFormContext } = jest.requireActual(
      'react-hook-form',
    ) as typeof import('react-hook-form');
    const { setValue } = useFormContext<AgentForm>();

    mockLastAgentSelectHasDraft = hasDraft;
    return (
      <>
        <div>{AGENT_SELECT_LABEL}</div>
        <button
          type="button"
          onClick={() => setValue('name', 'Saved from API', { shouldDirty: false })}
        >
          {PROGRAMMATIC_UPDATE_LABEL}
        </button>
        <button type="button" onClick={() => onAgentChange?.('agent-456')}>
          {SELECT_AGENT_WITH_DRAFT_LABEL}
        </button>
      </>
    );
  },
}));

jest.mock('../AgentConfig', () => ({
  __esModule: true,
  default: function MockAgentConfig() {
    const { useFormContext } = jest.requireActual(
      'react-hook-form',
    ) as typeof import('react-hook-form');
    const { register, setValue } = useFormContext<AgentForm>();

    return (
      <div>
        <input aria-label="Draft name" {...register('name')} />
        <textarea aria-label="Draft instructions" {...register('instructions')} />
        <input aria-label="Draft model" {...register('model')} />
        <input aria-label={AVATAR_ACTION_LABEL} {...register('avatar_action')} />
        <button
          type="button"
          onClick={() => setValue('avatar_action', 'reset', { shouldDirty: true })}
        >
          {RESET_AVATAR_LABEL}
        </button>
      </div>
    );
  },
}));

jest.mock('../AgentFooter', () => ({
  __esModule: true,
  default: ({ onDraftClear }: MockAgentFooterProps) => (
    <>
      <button type="button" onClick={() => onDraftClear?.('agent-123')}>
        {DELETE_AGENT_LABEL}
      </button>
      <button type="submit">{SAVE_AGENT_LABEL}</button>
    </>
  ),
}));

jest.mock('../Advanced/AdvancedPanel', () => ({
  __esModule: true,
  default: () => <div>{ADVANCED_PANEL_LABEL}</div>,
}));

jest.mock('../AgentPanelSkeleton', () => ({
  __esModule: true,
  default: () => <div>{LOADING_LABEL}</div>,
}));

jest.mock('../ModelPanel', () => ({
  __esModule: true,
  default: () => <div>{MODEL_PANEL_LABEL}</div>,
}));

function PanelControls() {
  const { setActive } = useActivePanel();

  return (
    <>
      <button type="button" onClick={() => setActive('agents')}>
        {AGENTS_BUTTON_LABEL}
      </button>
      <button type="button" onClick={() => setActive('files')}>
        {FILES_BUTTON_LABEL}
      </button>
    </>
  );
}

function Harness() {
  const Icon = () => null;
  const links = [
    {
      title: 'com_sidepanel_agent_builder',
      icon: Icon,
      id: 'agents',
      Component: AgentPanel,
    },
    {
      title: 'com_sidepanel_attach_files',
      icon: Icon,
      id: 'files',
      Component: () => <div>{FILES_PANEL_LABEL}</div>,
    },
  ] as NavLink[];

  return (
    <ActivePanelProvider>
      <PanelControls />
      <Nav links={links} />
    </ActivePanelProvider>
  );
}

describe('AgentPanel draft preservation', () => {
  beforeEach(() => {
    localStorage.setItem('side:active-panel', 'agents');
    mockCurrentAgentId = undefined;
    mockLastAgentSelectHasDraft = undefined;
    mockUserId = MOCK_USER_ID;
    clearAllAgentDrafts();
  });

  afterEach(() => {
    localStorage.removeItem('side:active-panel');
  });

  it('restores unsaved new-agent values after switching to Files and back', () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'Navigation survivor' },
    });
    fireEvent.change(screen.getByLabelText('Draft instructions'), {
      target: { value: 'Keep these instructions.' },
    });
    fireEvent.change(screen.getByLabelText('Draft model'), {
      target: { value: 'gpt-4o-mini' },
    });

    fireEvent.click(screen.getByRole('button', { name: FILES_BUTTON_LABEL }));
    expect(screen.getByText(FILES_PANEL_LABEL)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: AGENTS_BUTTON_LABEL }));

    expect(screen.getByLabelText('Draft name')).toHaveValue('Navigation survivor');
    expect(screen.getByLabelText('Draft instructions')).toHaveValue('Keep these instructions.');
    expect(screen.getByLabelText('Draft model')).toHaveValue('gpt-4o-mini');
  });

  it('clears an existing draft when Create new agent is clicked', () => {
    mockCurrentAgentId = 'agent-123';
    saveAgentDraft(
      'agent-123',
      {
        id: 'agent-123',
        name: 'Unsaved saved-agent name',
        description: '',
        instructions: 'Unsaved saved-agent instructions',
        model: 'gpt-4o',
        model_parameters: {} as AgentForm['model_parameters'],
        provider: { label: 'OpenAI', value: 'openAI' },
        tools: [],
        tool_options: {},
        category: 'general',
        execute_code: false,
        file_search: false,
        web_search: false,
      } as AgentForm,
      MOCK_USER_ID,
    );

    render(<Harness />);

    expect(screen.getByLabelText('Draft name')).toHaveValue('Unsaved saved-agent name');
    expect(mockLastAgentSelectHasDraft).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_create_new_agent' }));

    expect(screen.getByLabelText('Draft name')).toHaveValue('');
    expect(screen.getByLabelText('Draft instructions')).toHaveValue('');
    expect(screen.getByLabelText('Draft model')).toHaveValue('');
    expect(getAgentDraft('agent-123', MOCK_USER_ID)).toBeUndefined();
    expect(getAgentDraft(undefined, MOCK_USER_ID)).toBeUndefined();
    expect(mockLastAgentSelectHasDraft).toBe(false);
  });

  it('does not save a draft for programmatic form updates', async () => {
    mockCurrentAgentId = 'agent-123';

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: PROGRAMMATIC_UPDATE_LABEL }));

    await waitFor(() => {
      expect(screen.getByLabelText('Draft name')).toHaveValue('Saved from API');
    });
    expect(getAgentDraft('agent-123', MOCK_USER_ID)).toBeUndefined();
    expect(mockLastAgentSelectHasDraft).toBe(false);
  });

  it('restores a draft when the current agent changes while mounted', async () => {
    mockCurrentAgentId = 'agent-123';
    const { rerender } = render(<Harness />);

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'Previous agent draft' },
    });
    saveAgentDraft(
      'agent-456',
      {
        id: 'agent-456',
        name: 'Mounted switch draft',
        description: '',
        instructions: 'Draft for the switched agent',
        model: 'gpt-4o',
        model_parameters: {} as AgentForm['model_parameters'],
        provider: { label: 'OpenAI', value: 'openAI' },
        tools: [],
        tool_options: {},
        category: 'general',
        execute_code: false,
        file_search: false,
        web_search: false,
      } as AgentForm,
      MOCK_USER_ID,
    );

    mockCurrentAgentId = 'agent-456';
    rerender(<Harness />);

    await waitFor(() => {
      expect(screen.getByLabelText('Draft name')).toHaveValue('Mounted switch draft');
    });
    expect(screen.getByLabelText('Draft instructions')).toHaveValue('Draft for the switched agent');
    expect(getAgentDraft('agent-123', MOCK_USER_ID)?.name).toBe('Previous agent draft');
    expect(mockLastAgentSelectHasDraft).toBe(true);
  });

  it('preserves a selected agent draft when leaving another agent', async () => {
    mockCurrentAgentId = 'agent-123';
    const { rerender } = render(<Harness />);

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'Draft for current agent' },
    });
    await waitFor(() => {
      expect(getAgentDraft('agent-123', MOCK_USER_ID)?.name).toBe('Draft for current agent');
    });

    saveAgentDraft(
      'agent-456',
      {
        id: 'agent-456',
        name: 'Destination agent draft',
        description: '',
        instructions: 'Keep the destination draft',
        model: 'gpt-4o',
        model_parameters: {} as AgentForm['model_parameters'],
        provider: { label: 'OpenAI', value: 'openAI' },
        tools: [],
        tool_options: {},
        category: 'general',
        execute_code: false,
        file_search: false,
        web_search: false,
      } as AgentForm,
      MOCK_USER_ID,
    );

    fireEvent.click(screen.getByRole('button', { name: SELECT_AGENT_WITH_DRAFT_LABEL }));

    expect(getAgentDraft('agent-123', MOCK_USER_ID)).toBeUndefined();
    expect(getAgentDraft('agent-456', MOCK_USER_ID)?.name).toBe('Destination agent draft');

    mockCurrentAgentId = 'agent-456';
    rerender(<Harness />);

    await waitFor(() => {
      expect(screen.getByLabelText('Draft name')).toHaveValue('Destination agent draft');
    });
  });

  it('keeps remounted new-agent drafts keyed as new when a chat agent id is restored', async () => {
    const { rerender } = render(<Harness />);

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'New agent draft' },
    });
    await waitFor(() => {
      expect(getAgentDraft(undefined, MOCK_USER_ID)?.name).toBe('New agent draft');
    });

    mockCurrentAgentId = 'agent-123';
    rerender(<Harness />);

    await waitFor(() => {
      expect(screen.getByLabelText('Draft name')).toHaveValue('New agent draft');
    });

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'New agent draft continued' },
    });

    await waitFor(() => {
      expect(getAgentDraft(undefined, MOCK_USER_ID)?.name).toBe('New agent draft continued');
    });
    expect(getAgentDraft('agent-123', MOCK_USER_ID)).toBeUndefined();
  });

  it('does not carry drafts across user changes while mounted', async () => {
    const { rerender } = render(<Harness />);

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'First user draft' },
    });
    await waitFor(() => {
      expect(getAgentDraft(undefined, MOCK_USER_ID)?.name).toBe('First user draft');
    });

    mockUserId = 'user-456';
    rerender(<Harness />);

    await waitFor(() => {
      expect(screen.getByLabelText('Draft name')).toHaveValue('');
    });
    expect(getAgentDraft(undefined, 'user-456')).toBeUndefined();
    expect(getAgentDraft(undefined, MOCK_USER_ID)?.name).toBe('First user draft');
  });

  it('restores avatar reset-only drafts after switching to Files and back', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: RESET_AVATAR_LABEL }));
    await waitFor(() => {
      expect(getAgentDraft(undefined, MOCK_USER_ID)?.avatar_action).toBe('reset');
    });

    fireEvent.click(screen.getByRole('button', { name: FILES_BUTTON_LABEL }));
    expect(screen.getByText(FILES_PANEL_LABEL)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: AGENTS_BUTTON_LABEL }));

    await waitFor(() => {
      expect(screen.getByLabelText(AVATAR_ACTION_LABEL)).toHaveValue('reset');
    });
  });

  it('does not recreate a deleted agent draft when the active agent changes', async () => {
    mockCurrentAgentId = 'agent-123';
    const { rerender } = render(<Harness />);

    fireEvent.change(screen.getByLabelText('Draft name'), {
      target: { value: 'Edited before delete' },
    });

    await waitFor(() => {
      expect(getAgentDraft('agent-123', MOCK_USER_ID)?.name).toBe('Edited before delete');
    });

    fireEvent.click(screen.getByRole('button', { name: DELETE_AGENT_LABEL }));
    expect(getAgentDraft('agent-123', MOCK_USER_ID)).toBeUndefined();

    mockCurrentAgentId = 'agent-456';
    rerender(<Harness />);

    await waitFor(() => {
      expect(getAgentDraft('agent-123', MOCK_USER_ID)).toBeUndefined();
    });
  });
});
