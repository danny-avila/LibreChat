/** @jest-environment jsdom */
import { FormProvider, useForm } from 'react-hook-form';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AgentForm } from '~/common';
import StatefulSessions from '../Advanced/StatefulSessions';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: {} }),
  useGetAgentsConfig: () => ({
    agentsConfig: {
      statefulCodeSessions: {
        environments: [{ id: 'byom', name: 'My machine', type: 'attached', default: true }],
      },
    },
  }),
}));

function IdentityForm() {
  const methods = useForm<AgentForm>({
    mode: 'onChange',
    defaultValues: { execute_code: true, stateful_code_sessions: true },
  });
  return (
    <FormProvider {...methods}>
      <StatefulSessions />
    </FormProvider>
  );
}

test('clears cross-field errors when completing or clearing a Git identity', async () => {
  render(<IdentityForm />);
  const name = screen.getByLabelText('com_ui_agent_git_name');
  const email = screen.getByLabelText('com_ui_agent_git_email');
  fireEvent.change(name, { target: { value: 'Coding Agent' } });
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  fireEvent.change(email, { target: { value: 'agent@example.com' } });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  fireEvent.change(name, { target: { value: '' } });
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  fireEvent.change(email, { target: { value: '' } });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
