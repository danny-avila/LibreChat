import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgentItem } from '../items/types';
import ToolCard from '../ToolCard';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, options?: Record<string, unknown>): string => {
      if (!options) return key;
      const parts = Object.entries(options).map(([name, value]) => `${name}=${String(value)}`);
      return `${key}[${parts.join(',')}]`;
    },
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));

const skill: AgentItem = {
  kind: 'skill',
  id: 's1',
  name: 'Reviewer',
  description: 'Review PRs',
  iconKey: 'skill',
  skill: { _id: 's1', name: 'Reviewer' } as never,
};

describe('ToolCard', () => {
  test('renders item name and description', () => {
    render(<ToolCard item={skill} selected={false} onToggle={jest.fn()} />);
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Review PRs')).toBeInTheDocument();
  });

  test('clicking the card invokes onToggle with the item', () => {
    const onToggle = jest.fn();
    render(<ToolCard item={skill} selected={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /Reviewer/ }));
    expect(onToggle).toHaveBeenCalledWith(skill);
  });

  test('selected cards expose aria-pressed=true', () => {
    render(<ToolCard item={skill} selected onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Reviewer/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('renders a verified badge for built-ins', () => {
    const builtin: AgentItem = {
      kind: 'builtin',
      id: 'execute_code',
      name: 'Code Interpreter',
      description: 'Run Python',
      iconKey: 'execute_code',
    };
    render(<ToolCard item={builtin} selected={false} onToggle={jest.fn()} />);
    expect(screen.getByLabelText('com_ui_tools_native')).toBeInTheDocument();
  });

  test('does not render the tool-count pill for MCP cards', () => {
    const mcp: AgentItem = {
      kind: 'mcp',
      id: 'everything',
      name: 'Everything',
      description: '',
      iconKey: 'mcp',
      server: { serverName: 'everything', isConfigured: true, tools: [] } as never,
      toolCount: 14,
    };
    render(<ToolCard item={mcp} selected={false} onToggle={jest.fn()} />);
    expect(screen.queryByText('com_ui_tools_count[count=14]')).not.toBeInTheDocument();
  });

  test('renders public and shared-author badges for another user public skill', () => {
    const shared: AgentItem = {
      kind: 'skill',
      id: 's2',
      name: 'Shared',
      description: '',
      iconKey: 'skill',
      skill: {
        _id: 's2',
        name: 'Shared',
        author: 'u2',
        authorName: 'Alice',
        isPublic: true,
      } as never,
    };
    render(<ToolCard item={shared} selected={false} onToggle={jest.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('com_ui_sr_public_skill')).toBeInTheDocument();
  });

  test('omits the author badge for the current user own skill', () => {
    const own: AgentItem = {
      kind: 'skill',
      id: 's3',
      name: 'Mine',
      description: '',
      iconKey: 'skill',
      skill: { _id: 's3', name: 'Mine', author: 'u1', authorName: 'Me', isPublic: false } as never,
    };
    render(<ToolCard item={own} selected={false} onToggle={jest.fn()} />);
    expect(screen.queryByText('Me')).not.toBeInTheDocument();
  });
});
