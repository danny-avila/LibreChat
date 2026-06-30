import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolsSection from '../ToolsSection';

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    getValues: jest.fn(),
    setValue: jest.fn(),
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
  useBuiltinAuthMap: () => new Map(),
  useUninstallToolCredentials: () => jest.fn(),
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
});
