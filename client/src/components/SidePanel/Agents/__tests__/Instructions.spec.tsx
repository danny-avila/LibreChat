import { ToastProvider } from '@librechat/client';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AgentForm } from '~/common';
import Instructions from '../Instructions';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    key === 'com_agents_prompt_version_number' ? `${key}:${values?.version}` : key,
  useDebounce: (value: string) => value,
  useGetAgentsConfig: () => ({ agentsConfig: { capabilities: mockAgentCapabilities } }),
}));

const mockRefetch = jest.fn();
const mockAgentCapabilities = ['instruction_prompts'];
const mockPromptGroups: Array<Record<string, unknown>> = [];
const mockPrompts: Array<Record<string, unknown>> = [];

jest.mock('~/data-provider', () => ({
  useGetAllPromptGroups: () => ({
    data: mockPromptGroups,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: mockRefetch,
  }),
  useGetPrompts: () => ({
    data: mockPrompts,
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
  onSubmit = () => undefined,
}: {
  defaultValues?: Partial<AgentForm>;
  onSubmit?: (values: AgentForm) => void;
}) {
  const methods = useForm<AgentForm>({ defaultValues });
  return (
    <ToastProvider>
      <FormProvider {...methods}>
        <form onSubmit={methods.handleSubmit(onSubmit)}>
          <Instructions />
          <button type="submit" aria-label="com_ui_save" />
        </form>
      </FormProvider>
    </ToastProvider>
  );
}

describe('Agent Instructions', () => {
  beforeEach(() => {
    mockPromptGroups.length = 0;
    mockPrompts.length = 0;
    mockAgentCapabilities.length = 0;
    mockAgentCapabilities.push('instruction_prompts');
  });

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

  it('hides prompt references until the rollout capability is enabled', async () => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
    mockAgentCapabilities.length = 0;
    render(<InstructionsHarness />);

    fireEvent.click(screen.getByRole('combobox', { name: 'com_agents_prompt_source' }));

    expect(
      await screen.findByRole('option', { name: 'com_agents_prompt_source_inline' }),
    ).toBeVisible();
    expect(screen.queryByRole('option', { name: 'com_agents_prompt_source_librechat' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'com_agents_prompt_source_langfuse' })).toBeNull();
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

  it('keeps a pinned LibreChat version selected after an earlier version is deleted', () => {
    mockPromptGroups.push({ _id: 'group-1', name: 'Support' });
    mockPrompts.push({
      _id: 'prompt-2',
      groupId: 'group-1',
      prompt: 'current instructions',
      type: 'text',
      createdAt: '2026-09-18T00:00:00.000Z',
    });

    render(
      <InstructionsHarness
        defaultValues={{
          instructions: '',
          instruction_prompt: {
            source: 'librechat',
            promptId: 'group-1',
            name: 'Support',
            version: 2,
            versionId: 'prompt-2',
          },
        }}
      />,
    );

    const versionSelect = screen.getByRole('combobox', { name: 'com_agents_prompt_version' });
    expect(versionSelect).toHaveTextContent('com_agents_prompt_version_number:2');
    expect(screen.getByDisplayValue('com_agents_prompt_version_number:2')).toHaveValue('prompt-2');
  });

  it('allows an agent to save without inline instructions', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<InstructionsHarness onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('blocks unsupported LibreChat prompt types before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    mockPromptGroups.push({ _id: 'group-1', name: 'Support' });
    mockPrompts.push({
      _id: 'prompt-1',
      groupId: 'group-1',
      prompt: 'not valid agent instructions',
      type: 'chat',
      createdAt: '2026-09-18T00:00:00.000Z',
    });

    render(
      <InstructionsHarness
        defaultValues={{
          instructions: '',
          instruction_prompt: {
            source: 'librechat',
            promptId: 'group-1',
            name: 'Support',
          },
        }}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('com_agents_prompt_unsupported')).toHaveLength(2);
  });
});
