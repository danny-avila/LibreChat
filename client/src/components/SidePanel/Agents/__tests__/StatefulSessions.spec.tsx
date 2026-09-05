/** @jest-environment jsdom */
/* eslint-disable i18next/no-literal-string -- Test harness controls are not product UI. */
import { FormProvider, useForm } from 'react-hook-form';
import { AgentCapabilities } from 'librechat-data-provider';
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
      <button onClick={() => methods.setValue(AgentCapabilities.execute_code, false)}>
        Disable code
      </button>
      <button onClick={() => methods.setValue('code_environment_id', 'managed')}>
        Use managed
      </button>
      <button onClick={() => methods.setValue(AgentCapabilities.stateful_code_sessions, false)}>
        Disable sessions
      </button>
      <output data-testid="identity">{JSON.stringify(methods.watch('git_identity'))}</output>
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

test.each(['Disable code', 'Use managed', 'Disable sessions'])(
  'discards a partial identity when its controls disappear: %s',
  async (action) => {
    render(<IdentityForm />);
    fireEvent.change(screen.getByLabelText('com_ui_agent_git_name'), {
      target: { value: 'Partial Agent' },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText(action));
    await waitFor(() => expect(screen.getByTestId('identity')).toBeEmptyDOMElement());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

test('preserves a complete identity when switching away from the attached environment', async () => {
  render(<IdentityForm />);
  fireEvent.change(screen.getByLabelText('com_ui_agent_git_name'), {
    target: { value: 'Coding Agent' },
  });
  fireEvent.change(screen.getByLabelText('com_ui_agent_git_email'), {
    target: { value: 'agent@example.com' },
  });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  fireEvent.click(screen.getByText('Use managed'));
  expect(screen.getByTestId('identity')).toHaveTextContent('Coding Agent');
  expect(screen.getByTestId('identity')).toHaveTextContent('agent@example.com');
});
