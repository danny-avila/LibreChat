import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import ScheduleMCPRecovery from '../ScheduleMCPRecovery';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));

it('opens the exact descendant that owns an immediate MCP failure', async () => {
  const onOpenAgent = jest.fn();
  render(
    <ScheduleMCPRecovery
      outcomes={[
        {
          server: 'Notion',
          agentId: 'research-agent',
          status: 'mcp_configuration_missing',
        },
      ]}
      fallbackAgentId="root-agent"
      onOpenAgent={onOpenAgent}
    />,
  );

  await userEvent.click(
    screen.getByRole('button', {
      name: 'Notion, research-agent: com_ui_schedule_mcp_open_agent',
    }),
  );
  expect(onOpenAgent).toHaveBeenCalledWith('research-agent');
});
