import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';
import type { McpItem } from '../../items/types';
import McpSection from '../sections/McpSection';

const mockSetValue = jest.fn();
const mockGetValues = jest.fn((): string[] => []);

jest.mock('react-hook-form', () => ({
  useFormContext: () => ({ control: {}, setValue: mockSetValue, getValues: mockGetValues }),
  useWatch: () => mockGetValues(),
}));

jest.mock('~/Providers', () => ({
  useAgentPanelContext: () => ({ mcpServersMap: new Map() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAgentCapabilities: () => ({
    deferredToolsEnabled: false,
    programmaticToolsEnabled: false,
  }),
  useGetAgentsConfig: () => ({ agentsConfig: { capabilities: [] } }),
  useMCPServerManager: () => ({
    getServerStatusIconProps: () => null,
    getConfigDialogProps: () => null,
  }),
  useMCPToolOptions: () => ({
    isToolDeferred: () => false,
    isToolProgrammatic: () => false,
    toggleToolDefer: jest.fn(),
    toggleToolProgrammatic: jest.fn(),
    areAllToolsDeferred: () => false,
    areAllToolsProgrammatic: () => false,
    toggleDeferAll: jest.fn(),
    toggleProgrammaticAll: jest.fn(),
  }),
}));

jest.mock('../../../MCPToolItem', () => ({
  __esModule: true,
  default: ({
    tool,
    isSelected,
    onToggleSelect,
  }: {
    tool: { tool_id: string; name?: string };
    isSelected: boolean;
    onToggleSelect: () => void;
  }) => (
    <button
      type="button"
      data-testid={`tool-${tool.tool_id}`}
      aria-pressed={isSelected}
      onClick={onToggleSelect}
    >
      {tool.name || tool.tool_id}
    </button>
  ),
}));

jest.mock('~/components/MCP/MCPConfigDialog', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('~/components/MCP/MCPServerStatusIcon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@librechat/client', () => {
  const React = jest.requireActual('react');
  return {
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
      React.createElement('button', { type: 'button', onClick }, children),
    Checkbox: ({
      checked,
      onCheckedChange,
      'aria-label': ariaLabel,
    }: {
      checked: boolean;
      onCheckedChange: (next: boolean) => void;
      'aria-label': string;
    }) =>
      React.createElement('input', {
        type: 'checkbox',
        checked,
        'aria-label': ariaLabel,
        onChange: (e: { target: { checked: boolean } }) => onCheckedChange(e.target.checked),
      }),
  };
});

const item: McpItem = {
  kind: 'mcp',
  id: 'srv',
  name: 'srv',
  description: 'desc',
  iconKey: 'mcp',
  server: {
    serverName: 'srv',
    isConfigured: true,
    tools: [
      { tool_id: 'mcp:srv:a', name: 'A' },
      { tool_id: 'mcp:srv:b', name: 'B' },
    ],
    metadata: { description: 'desc' },
  } as never,
  toolCount: 2,
};

describe('McpSection', () => {
  beforeEach(() => {
    mockSetValue.mockClear();
    mockGetValues.mockReturnValue([]);
  });

  test('renders one row per tool', () => {
    render(<McpSection item={item} />);
    expect(screen.getByTestId('tool-mcp:srv:a')).toBeInTheDocument();
    expect(screen.getByTestId('tool-mcp:srv:b')).toBeInTheDocument();
  });

  test('toggling a tool writes its id into agent.tools', () => {
    render(<McpSection item={item} />);
    fireEvent.click(screen.getByTestId('tool-mcp:srv:a'));
    expect(mockSetValue).toHaveBeenCalledWith(
      'tools',
      ['mcp:srv:a'],
      expect.objectContaining({ shouldDirty: true }),
    );
  });

  test('select-all writes every tool id', () => {
    render(<McpSection item={item} />);
    fireEvent.click(screen.getByLabelText('com_ui_tools_mcp_select_all'));
    expect(mockSetValue).toHaveBeenCalledWith(
      'tools',
      expect.arrayContaining(['mcp:srv:a', 'mcp:srv:b']),
      expect.objectContaining({ shouldDirty: true }),
    );
  });

  test('deselect-all detaches the server by stripping every token', () => {
    mockGetValues.mockReturnValue(['mcp:srv:a', 'mcp:srv:b', 'sys__server__sys_mcp_srv']);
    render(<McpSection item={item} />);
    fireEvent.click(screen.getByLabelText('com_ui_tools_mcp_deselect_all'));
    expect(mockSetValue).toHaveBeenCalledWith(
      'tools',
      [],
      expect.objectContaining({ shouldDirty: true }),
    );
  });

  test('selection state tracks the watched tools field (re-render on toggle)', () => {
    mockGetValues.mockReturnValue(['mcp:srv:a']);
    render(<McpSection item={item} />);
    expect(screen.getByTestId('tool-mcp:srv:a')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tool-mcp:srv:b')).toHaveAttribute('aria-pressed', 'false');
  });

  test('shows empty hint when the server exposes no tools', () => {
    const empty: McpItem = {
      ...item,
      server: { ...item.server, tools: [] } as never,
      toolCount: 0,
    };
    render(<McpSection item={empty} />);
    expect(screen.getByText('com_ui_tools_mcp_no_tools')).toBeInTheDocument();
  });
});
