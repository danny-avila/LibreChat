import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgentToolType } from 'librechat-data-provider';
import MCPToolItem from '../MCPToolItem';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  TooltipAnchor: ({ render }: { render: React.ReactElement }) => render,
}));

const tool = {
  tool_id: 'mcp:srv:execute',
  metadata: { name: 'execute', description: 'Runs JavaScript code against the API.' },
} as unknown as AgentToolType;

function setup(overrides: Partial<React.ComponentProps<typeof MCPToolItem>> = {}) {
  const props = {
    tool,
    isSelected: false,
    isDeferred: false,
    isProgrammatic: false,
    isBackground: false,
    deferredToolsEnabled: false,
    programmaticToolsEnabled: false,
    backgroundToolsEnabled: false,
    onToggleSelect: jest.fn(),
    onToggleDefer: jest.fn(),
    onToggleProgrammatic: jest.fn(),
    onToggleBackground: jest.fn(),
    ...overrides,
  };
  render(<MCPToolItem {...props} />);
  return props;
}

describe('MCPToolItem', () => {
  test('clicking the row (not just a checkbox) toggles selection', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'execute' }));
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
  });

  test('reflects selection via aria-pressed', () => {
    setup({ isSelected: true });
    expect(screen.getByRole('button', { name: 'execute' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the info button toggles the description panel via aria-expanded', () => {
    setup();
    const infoButton = screen.getByRole('button', { name: 'com_ui_tools_info' });
    expect(infoButton).toHaveAttribute('aria-expanded', 'false');
    // The description is always rendered (the panel animates open/closed), so it stays queryable.
    expect(screen.getByText('Runs JavaScript code against the API.')).toBeInTheDocument();
    fireEvent.click(infoButton);
    expect(infoButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('detail button is an info affordance when no options are enabled', () => {
    setup();
    expect(screen.getByRole('button', { name: 'com_ui_tools_info' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_mcp_tool_options' }),
    ).not.toBeInTheDocument();
  });

  test('detail button stays an info affordance (never a cog) when options exist', () => {
    setup({ deferredToolsEnabled: true, programmaticToolsEnabled: true });
    expect(screen.getByRole('button', { name: 'com_ui_tools_info' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'com_ui_mcp_tool_options' }),
    ).not.toBeInTheDocument();
  });

  test('defer loading is an inline button (left of the cog) that toggles defer', () => {
    const props = setup({ deferredToolsEnabled: true });
    const deferButton = screen.getByRole('button', { name: 'com_ui_mcp_defer_loading' });
    fireEvent.click(deferButton);
    expect(props.onToggleDefer).toHaveBeenCalledTimes(1);
  });

  test('defer button is absent when deferred tools are disabled', () => {
    setup();
    expect(
      screen.queryByRole('button', { name: 'com_ui_mcp_defer_loading' }),
    ).not.toBeInTheDocument();
  });

  test('programmatic is an inline button rendered only when enabled', () => {
    const props = setup({ programmaticToolsEnabled: true });
    const programmaticButton = screen.getByRole('button', { name: 'com_ui_mcp_programmatic' });
    fireEvent.click(programmaticButton);
    expect(props.onToggleProgrammatic).toHaveBeenCalledTimes(1);
  });

  test('background is an inline button rendered only when enabled', () => {
    const props = setup({ backgroundToolsEnabled: true });
    const backgroundButton = screen.getByRole('button', { name: 'com_ui_mcp_background' });
    fireEvent.click(backgroundButton);
    expect(props.onToggleBackground).toHaveBeenCalledTimes(1);
  });

  test('background button is absent when background tools are disabled', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'com_ui_mcp_background' })).not.toBeInTheDocument();
  });
});
