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
const mockPreview = jest.fn((..._args: unknown[]) => ({
  data: undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: mockRefetch,
}));
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
  useAgentInstructionPromptPreview: (...args: unknown[]) => mockPreview(...args),
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
  it('allows unrelated edits when the unchanged saved prompt is inaccessible', async () => {
    const onSubmit = jest.fn();
    render(
      <InstructionsHarness
        defaultValues={{
          id: 'agent-1',
          instruction_prompt: {
            source: 'librechat',
            promptId: 'inaccessible',
            name: 'Protected',
          },
        }}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].instruction_prompt.promptId).toBe('inaccessible');
  });

  it('validates a changed prompt on an existing agent', async () => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
    const onSubmit = jest.fn();
    mockPromptGroups.push({ _id: 'other', name: 'Other prompt' });
    render(
      <InstructionsHarness
        defaultValues={{
          id: 'agent-1',
          instruction_prompt: {
            source: 'librechat',
            promptId: 'inaccessible',
            name: 'Protected',
          },
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'com_agents_prompt_select' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Other prompt' }));
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('com_agents_prompt_missing')).toBeVisible();
  });

  beforeEach(() => {
    mockPreview.mockClear();
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
            destinationId: 'b'.repeat(64),
          },
        }}
      />,
    );

    expect(screen.getByLabelText('com_agents_prompt_name')).toHaveValue('support-policy');
    expect(screen.getAllByLabelText('com_agents_prompt_version')[1]).toHaveValue(3);
    expect(mockPreview).toHaveBeenLastCalledWith(
      'support-policy',
      3,
      { enabled: true },
      'b'.repeat(64),
    );
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

describe('saved Langfuse prompt edits', () => {
  it('retains the destination when changing a pin and when switching to latest', async () => {
    HTMLElement.prototype.scrollIntoView = jest.fn();
    const onSubmit = jest.fn();
    render(
      <InstructionsHarness
        defaultValues={{
          instructions: '',
          instruction_prompt: {
            source: 'langfuse',
            name: 'support-policy',
            version: 3,
            destinationId: 'b'.repeat(64),
          },
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
    expect(mockPreview).toHaveBeenLastCalledWith(
      'support-policy',
      4,
      { enabled: true },
      'b'.repeat(64),
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'com_agents_prompt_version' }));
    fireEvent.click(await screen.findByRole('option', { name: 'com_agents_prompt_latest' }));
    expect(mockPreview).toHaveBeenLastCalledWith(
      'support-policy',
      undefined,
      { enabled: true },
      'b'.repeat(64),
    );
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    expect(onSubmit.mock.calls[0][0].instruction_prompt).toEqual({
      source: 'langfuse',
      name: 'support-policy',
      version: undefined,
      destinationId: 'b'.repeat(64),
    });
  });
  it('disables preview requests for stored references after the capability is disabled', () => {
    mockAgentCapabilities.length = 0;
    render(
      <InstructionsHarness
        defaultValues={{
          instruction_prompt: {
            source: 'langfuse',
            name: 'support-policy',
            destinationId: 'b'.repeat(64),
          },
        }}
      />,
    );
    expect(mockPreview).toHaveBeenLastCalledWith(
      'support-policy',
      undefined,
      { enabled: false },
      'b'.repeat(64),
    );
    mockAgentCapabilities.push('instruction_prompts');
  });
});

describe('disabled instruction prompt rollout', () => {
  it('permits unrelated edits without loading a saved LibreChat prompt', async () => {
    mockAgentCapabilities.length = 0;
    mockPromptGroups.length = 0;
    mockPrompts.length = 0;
    const onSubmit = jest.fn();
    render(
      <InstructionsHarness
        defaultValues={{
          id: 'agent-1',
          instruction_prompt: {
            source: 'librechat',
            promptId: 'group-1',
            name: 'Support',
          },
        }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_disabled');
    expect(screen.getByRole('combobox', { name: 'com_agents_prompt_source' })).toHaveTextContent(
      'com_agents_prompt_source_librechat',
    );
    expect(screen.getByRole('combobox', { name: 'com_agents_prompt_select' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].instruction_prompt).toMatchObject({ promptId: 'group-1' });
    mockAgentCapabilities.push('instruction_prompts');
  });
});
