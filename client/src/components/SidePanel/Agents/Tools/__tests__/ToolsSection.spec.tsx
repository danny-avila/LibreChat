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

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    getValues: () => [],
    setValue: mockSetValue,
  }),
  useWatch: () => undefined,
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
