/** @jest-environment jsdom */
/* eslint-disable i18next/no-literal-string -- Test harness controls are not product UI. */
import { useState } from 'react';
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

function IdentityForm({ savedIdentity }: { savedIdentity?: AgentForm['git_identity'] }) {
  const [advanced, setAdvanced] = useState(true);
  const methods = useForm<AgentForm>({
    mode: 'onChange',
    defaultValues: {
      execute_code: true,
      stateful_code_sessions: true,
      git_identity: savedIdentity,
    },
  });
  return (
    <FormProvider {...methods}>
      {advanced && <StatefulSessions />}
      <button onClick={() => setAdvanced(!advanced)}>Toggle Advanced</button>
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

test.each(['', 'not-an-email'])(
  'restores the saved identity when reopening an invalid draft: %s',
  async (email) => {
    render(<IdentityForm savedIdentity={{ name: 'Saved Agent', email: 'saved@example.com' }} />);
    fireEvent.change(screen.getByLabelText('com_ui_agent_git_email'), {
      target: { value: email },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Toggle Advanced'));
    fireEvent.click(screen.getByText('Toggle Advanced'));
    expect(screen.getByLabelText('com_ui_agent_git_name')).toHaveValue('Saved Agent');
    expect(screen.getByLabelText('com_ui_agent_git_email')).toHaveValue('saved@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

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

test.each(['Disable code', 'Use managed', 'Disable sessions', 'Toggle Advanced'])(
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

test.each(['Disable code', 'Use managed', 'Disable sessions', 'Toggle Advanced'])(
  'discards an invalid email when its controls disappear: %s',
  async (action) => {
    render(<IdentityForm />);
    fireEvent.change(screen.getByLabelText('com_ui_agent_git_name'), {
      target: { value: 'Coding Agent' },
    });
    fireEvent.change(screen.getByLabelText('com_ui_agent_git_email'), {
      target: { value: 'not-an-email' },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByText(action));
    await waitFor(() => expect(screen.getByTestId('identity')).toBeEmptyDOMElement());
  },
);

test.each([
  { name: 'Coding Agent', email: 'agent@example.com' },
  { name: '', email: '' },
])('retains a valid identity or explicit clear through panel navigation: %j', async (identity) => {
  render(<IdentityForm />);
  fireEvent.change(screen.getByLabelText('com_ui_agent_git_name'), {
    target: { value: identity.name },
  });
  fireEvent.change(screen.getByLabelText('com_ui_agent_git_email'), {
    target: { value: identity.email },
  });
  fireEvent.click(screen.getByText('Toggle Advanced'));
  expect(screen.getByTestId('identity')).toHaveTextContent(JSON.stringify(identity));
  fireEvent.click(screen.getByText('Toggle Advanced'));
  expect(screen.getByLabelText('com_ui_agent_git_name')).toHaveValue(identity.name);
  expect(screen.getByLabelText('com_ui_agent_git_email')).toHaveValue(identity.email);
  fireEvent.change(screen.getByLabelText('com_ui_agent_git_email'), {
    target: { value: 'invalid' },
  });
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

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
