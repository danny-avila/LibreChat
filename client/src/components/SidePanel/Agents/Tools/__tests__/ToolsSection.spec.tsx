import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AgentItem } from '../items/types';
import ToolsSection from '../ToolsSection';

let mockSelected: AgentItem[] = [];
let mockFileEntries: {
  contextFiles: unknown[];
  knowledgeFiles: unknown[];
  codeFiles: unknown[];
} = { contextFiles: [], knowledgeFiles: [], codeFiles: [] };
const mockSetValue = jest.fn();
let mockFormValues: Record<string, unknown> = {};

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    getValues: (name: string) => mockFormValues[name],
    setValue: mockSetValue,
  }),
  useWatch: ({ name }: { name: string }) => mockFormValues[name],
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: () => true,
}));

jest.mock('~/Providers', () => ({
  useAgentPanelContext: () => ({
    agentsConfig: { capabilities: ['skills'] },
    regularTools: [],
    mcpServersMap: new Map(),
    actions: [],
  }),
}));

jest.mock('~/data-provider', () => ({
  useListSkillsQuery: () => ({ data: { skills: [] } }),
  useDeleteAgentAction: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/hooks/MCP', () => ({
  useRemoveMCPTool: () => ({ removeTool: jest.fn() }),
  useVisibleTools: () => ({ toolIds: [], mcpServerNames: [] }),
}));

jest.mock('../hooks', () => ({
  useAgentItems: () => ({ catalog: [], selected: mockSelected, tools: [] }),
  useResolvedSkills: (skills?: unknown[]) => skills,
  useAgentFileEntries: () => mockFileEntries,
  useUninstallToolCredentials: () => jest.fn(),
}));

jest.mock('../ToolRow', () => ({
  __esModule: true,
  default: ({ item, onRemove }: { item: AgentItem; onRemove: (item: AgentItem) => void }) => (
    <button type="button" aria-label={`remove-${item.id}`} onClick={() => onRemove(item)}>
      {item.id}
    </button>
  ),
}));

jest.mock('../ItemDialog/ItemDialog', () => ({
  __esModule: true,
  default: ({ item }: { item: AgentItem | null }) =>
    item ? <div data-testid="item-dialog">{item.id}</div> : null,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
  Label: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  OGDialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  OGDialogTemplate: () => null,
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
  HoverCard: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  HoverCardPortal: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  HoverCardContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CircleHelpIcon: () => <svg aria-hidden="true" />,
}));

jest.mock('../ToolsMarketplaceDialog', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="marketplace-open" /> : null),
}));

const fileSearchItem: AgentItem = {
  kind: 'builtin',
  id: 'file_search',
  name: 'com_assistants_file_search',
  description: '',
  iconKey: 'file_search',
};

beforeEach(() => {
  mockSelected = [];
  mockFileEntries = { contextFiles: [], knowledgeFiles: [], codeFiles: [] };
  mockFormValues = {};
  mockSetValue.mockClear();
});

describe('ToolsSection', () => {
  test('renders Tools header', () => {
    render(<ToolsSection agentId="a" />);
    expect(screen.getByText('com_ui_tools_section_title')).toBeInTheDocument();
  });

  test('renders a separate Skills section', () => {
    render(<ToolsSection agentId="a" />);
    expect(screen.getByText('com_ui_skills')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_add_skills' })).toBeInTheDocument();
  });

  test('renders Add button that opens the marketplace dialog', () => {
    render(<ToolsSection agentId="a" />);
    const addButton = screen.getByRole('button', { name: 'com_ui_add_tools' });
    fireEvent.click(addButton);
    expect(screen.getByTestId('marketplace-open')).toBeInTheDocument();
  });

  test('renders empty state for both sections when nothing is selected', () => {
    render(<ToolsSection agentId="a" />);
    expect(screen.getByText('com_ui_tools_empty')).toBeInTheDocument();
    expect(screen.getByText('com_ui_skills_empty')).toBeInTheDocument();
  });

  test('opens the config dialog instead of toggling when a file-backed built-in holds files', () => {
    mockSelected = [fileSearchItem];
    mockFileEntries = { contextFiles: [], knowledgeFiles: [['f1', {}]], codeFiles: [] };
    render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'remove-file_search' }));
    expect(screen.getByTestId('item-dialog')).toHaveTextContent('file_search');
    expect(mockSetValue).not.toHaveBeenCalledWith('file_search', false, expect.anything());
  });

  test('toggles the flag off when a file-backed built-in has no files', () => {
    mockSelected = [fileSearchItem];
    mockFileEntries = { contextFiles: [], knowledgeFiles: [], codeFiles: [] };
    render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByRole('button', { name: 'remove-file_search' }));
    expect(screen.queryByTestId('item-dialog')).not.toBeInTheDocument();
    expect(mockSetValue).toHaveBeenCalledWith('file_search', false, { shouldDirty: true });
  });
});

describe('use all skills toggle', () => {
  test('renders off inside the Skills section by default', () => {
    render(<ToolsSection agentId="a" />);
    expect(screen.getByText('com_ui_skills_use_all')).toBeInTheDocument();
    expect(screen.getByText('com_ui_skills_use_all_hint')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  test('turning it on clears the selection and enables the master flag', () => {
    mockFormValues = { skills: ['s1'], skills_enabled: true };
    render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(mockSetValue).toHaveBeenCalledWith('skills', [], { shouldDirty: true });
    expect(mockSetValue).toHaveBeenCalledWith('skills_enabled', true, { shouldDirty: true });
  });

  test('while on, hides Add and the skill list and shows the All badge', () => {
    mockFormValues = { skills: [], skills_enabled: true };
    render(<ToolsSection agentId="a" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: 'com_ui_add_skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /com_ui_skills_empty/ })).not.toBeInTheDocument();
    expect(screen.getByText('com_ui_all_proper')).toBeInTheDocument();
  });

  test('clicking the label does not toggle the switch', () => {
    render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByText('com_ui_skills_use_all'));
    expect(mockSetValue).not.toHaveBeenCalled();
  });

  test('turning it off restores the previously selected skills', () => {
    mockFormValues = { skills: ['s1'], skills_enabled: true };
    const { rerender } = render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByRole('switch'));
    mockFormValues = { skills: [], skills_enabled: true };
    rerender(<ToolsSection agentId="a" />);
    mockSetValue.mockClear();
    fireEvent.click(screen.getByRole('switch'));
    expect(mockSetValue).toHaveBeenCalledWith('skills', ['s1'], { shouldDirty: true });
    expect(mockSetValue).toHaveBeenCalledWith('skills_enabled', true, { shouldDirty: true });
  });

  test('does not restore a stash from a different agent', () => {
    mockFormValues = { skills: ['s1'], skills_enabled: true };
    const { rerender } = render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByRole('switch'));
    mockFormValues = { skills: [], skills_enabled: true };
    rerender(<ToolsSection agentId="b" />);
    mockSetValue.mockClear();
    fireEvent.click(screen.getByRole('switch'));
    expect(mockSetValue).toHaveBeenCalledWith('skills', [], { shouldDirty: true });
    expect(mockSetValue).toHaveBeenCalledWith('skills_enabled', false, { shouldDirty: true });
  });

  test('turning it off with nothing stashed disables the master flag', () => {
    mockFormValues = { skills: [], skills_enabled: true };
    render(<ToolsSection agentId="a" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(mockSetValue).toHaveBeenCalledWith('skills', [], { shouldDirty: true });
    expect(mockSetValue).toHaveBeenCalledWith('skills_enabled', false, { shouldDirty: true });
  });
});
