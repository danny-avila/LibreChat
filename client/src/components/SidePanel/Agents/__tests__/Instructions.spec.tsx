import { ToastProvider } from '@librechat/client';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgentForm } from '~/common';
import Instructions from '../Instructions';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const mockRefetch = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetAllPromptGroups: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: mockRefetch,
  }),
  useGetPrompts: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: mockRefetch,
  }),
  useAgentInstructionPromptPreview: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: mockRefetch,
  }),
}));

function InstructionsHarness({
  defaultValues = { instructions: '' },
}: {
  defaultValues?: Partial<AgentForm>;
}) {
  const methods = useForm<AgentForm>({ defaultValues });
  return (
    <ToastProvider>
      <FormProvider {...methods}>
        <Instructions />
      </FormProvider>
    </ToastProvider>
  );
}

describe('Agent Instructions', () => {
  it('offers special-variable insertion by default', async () => {
    const user = userEvent.setup();
    render(<InstructionsHarness />);

    await user.click(screen.getByRole('button', { name: 'com_ui_variables' }));
    expect(
      await screen.findByRole('menuitem', { name: 'com_ui_special_var_current_date' }),
    ).toBeInTheDocument();
  });

  it('offers inline, LibreChat, and Langfuse sources', async () => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
    render(<InstructionsHarness />);

    fireEvent.click(screen.getByRole('combobox', { name: 'com_agents_prompt_source' }));

    expect(
      await screen.findByRole('option', { name: 'com_agents_prompt_source_inline' }),
    ).toBeVisible();
    expect(
      screen.getByRole('option', { name: 'com_agents_prompt_source_librechat' }),
    ).toBeVisible();
    expect(screen.getByRole('option', { name: 'com_agents_prompt_source_langfuse' })).toBeVisible();
  });

  it('shows the empty state after selecting the LibreChat prompt source', async () => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
    render(<InstructionsHarness />);

    fireEvent.click(screen.getByRole('combobox', { name: 'com_agents_prompt_source' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'com_agents_prompt_source_librechat' }),
    );

    expect(screen.getByText('com_agents_prompt_empty')).toBeVisible();
    expect(screen.getByLabelText('com_agents_prompt_select')).toBeVisible();
  });

  it('restores a saved Langfuse reference into the builder', () => {
    render(
      <InstructionsHarness
        defaultValues={{
          id: 'agent-1',
          instructions: '',
          instruction_prompt: {
            source: 'langfuse',
            name: 'support-policy',
            version: 3,
          },
        }}
      />,
    );

    expect(screen.getByLabelText('com_agents_prompt_name')).toHaveValue('support-policy');
    expect(screen.getAllByLabelText('com_agents_prompt_version')[1]).toHaveValue(3);
  });
});
