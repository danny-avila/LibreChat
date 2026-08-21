import { createElement } from 'react';
import { ToastProvider } from '@librechat/client';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSchedule } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import ScheduleDialog from '../ScheduleDialog';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

/** `@librechat/client` primitives localize through their own `useLocalize`, so the
 *  shared `t` has to resolve too — not just the `i18n` this dialog reads for locale. */
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

const mockMutate = jest.fn();

/** Server-resolved schedule policy for the render under test. The dialog reads it from
 *  the schedules list query, the same cache entry the panel populates. */
let mockLimits: { maxPerUser: number; requireProject: boolean; projectId?: string } = {
  maxPerUser: 10,
  requireProject: false,
};

/** A project the paged list has NOT loaded, resolved by its own by-id read. */
let mockFetchedProject: { _id: string; name: string } | undefined;

jest.mock('~/data-provider', () => ({
  useProjectQuery: (projectId?: string | null) => ({
    data: projectId != null && projectId !== '' ? mockFetchedProject : undefined,
  }),
  useListAgentsQuery: () => ({
    data: [
      { id: 'agent-1', name: 'Research Agent' },
      { id: 'agent-2', name: 'Digest Agent' },
    ],
  }),
  useSchedulesQuery: () => ({ data: { schedules: [], limits: mockLimits } }),
  useProjectsInfiniteQuery: () => ({
    data: {
      pages: [
        {
          projects: [
            { _id: 'proj-1', name: 'Weekly Ops' },
            { _id: 'proj-2', name: 'Research' },
          ],
          nextCursor: null,
        },
      ],
    },
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
    isLoading: false,
  }),
  useCreateScheduleMutation: () => ({ mutate: mockMutate, isLoading: false }),
  useUpdateScheduleMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

const renderDialog = (schedule?: Partial<TSchedule>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ToastProvider, null, children),
    );
  }
  return render(
    <ScheduleDialog
      open={true}
      onOpenChange={jest.fn()}
      schedule={schedule as TSchedule | undefined}
    />,
    { wrapper: Wrapper },
  );
};

const storedSchedule = (over: Partial<TSchedule> = {}): Partial<TSchedule> => ({
  id: 'sched-1',
  name: 'Digest',
  prompt: 'Summarize',
  agent_id: 'agent-1',
  cadence: { frequency: 'daily', hour: 8, minute: 0 },
  timezone: 'America/New_York',
  target: 'new',
  enabled: true,
  configRevision: 3,
  runCount: 0,
  failureCount: 0,
  ...over,
});

/** Fills the two required text fields plus the agent, so a submit exercises the
 *  project rules rather than unrelated validation. */
const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByPlaceholderText('com_ui_schedule_name_placeholder'), 'Digest');
  await user.type(screen.getByPlaceholderText('com_ui_schedule_prompt_placeholder'), 'Summarize');
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('combobox', { name: 'com_ui_agent' }));
  await user.click(await within(dialog).findByRole('option', { name: /Research Agent/ }));
};

describe('ScheduleDialog', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockLimits = { maxPerUser: 10, requireProject: false };
    mockFetchedProject = undefined;
  });

  /**
   * The agent list must render INSIDE the dialog. Portaled to the body it lands
   * outside Radix's focus trap, where it cannot be clicked, tabbed into, or typed
   * in — and the trap fighting Ariakit for focus locks the page up.
   */
  it('opens the agent list inside the dialog rather than portaling it away', async () => {
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'com_ui_agent' }));

    expect(within(dialog).getByPlaceholderText('com_agents_search_name')).toBeInTheDocument();
  });

  it('exposes frequency as a radiogroup with the default selected', () => {
    renderDialog();

    const group = screen.getByRole('radiogroup', { name: 'com_ui_schedule_frequency' });
    expect(within(group).getByRole('radio', { name: 'com_ui_schedule_daily' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'com_ui_schedule_weekly' })).not.toBeChecked();
  });

  it('switches the day picker on only for weekly schedules', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByTestId('schedule-day-select')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'com_ui_schedule_weekly' }));
    expect(screen.getByTestId('schedule-day-select')).toBeInTheDocument();
  });

  /** The submit button sits in the dialog footer, outside the <form>, so it has to
   *  reach it by id — that association is what lets Enter submit from a text field. */
  it('wires the footer submit button to the form', () => {
    renderDialog();

    const form = document.getElementById('schedule-form');
    expect(form).toBeInstanceOf(HTMLFormElement);
    const submit = screen.getByRole('button', { name: 'com_ui_create' });
    expect(submit).toHaveAttribute('type', 'submit');
    expect(submit).toHaveAttribute('form', 'schedule-form');
  });

  it('describes both text fields with placeholders', () => {
    renderDialog();

    expect(screen.getByPlaceholderText('com_ui_schedule_name_placeholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('com_ui_schedule_prompt_placeholder')).toBeInTheDocument();
  });

  it('does not offer special-variable insertion in either prompt editor', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByRole('button', { name: 'com_ui_variables' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'com_ui_expand_editor' }));
    const expandedDialog = screen.getAllByRole('dialog').at(-1);
    expect(expandedDialog).toBeDefined();
    expect(
      within(expandedDialog as HTMLElement).queryByRole('button', { name: 'com_ui_variables' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the expanded prompt editor available and synchronized', async () => {
    const user = userEvent.setup();
    renderDialog();

    const prompt = screen.getByPlaceholderText('com_ui_schedule_prompt_placeholder');
    await user.type(prompt, 'Initial prompt');
    await user.click(screen.getByRole('button', { name: 'com_ui_expand_editor' }));

    const expandedDialog = screen.getAllByRole('dialog').at(-1);
    expect(expandedDialog).toBeDefined();
    const expandedPrompt = within(expandedDialog as HTMLElement).getByRole('textbox', {
      name: 'com_ui_prompt',
    });
    expect(expandedPrompt).toHaveValue('Initial prompt');

    await user.type(expandedPrompt, ' with details');
    expect(prompt).toHaveValue('Initial prompt with details');
  });

  it('preserves prompt validation and accessibility relationships', async () => {
    const user = userEvent.setup();
    renderDialog();

    const prompt = screen.getByPlaceholderText('com_ui_schedule_prompt_placeholder');
    expect(prompt).toHaveAccessibleName('com_ui_prompt');
    expect(prompt).toHaveAttribute('aria-required', 'true');
    expect(prompt).toHaveAttribute('aria-describedby', 'schedule-prompt-message');
    expect(prompt).toHaveAttribute('aria-invalid', 'false');

    await user.click(screen.getByRole('button', { name: 'com_ui_create' }));

    await waitFor(() => expect(prompt).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById('schedule-prompt-message')).toHaveTextContent(
      'com_ui_field_required',
    );
  });

  describe('project scope', () => {
    it('submits the chosen project so its runs are filed there', async () => {
      const user = userEvent.setup();
      renderDialog();
      await fillRequiredFields(user);

      await user.click(screen.getByRole('combobox', { name: 'com_ui_project' }));
      // Narrowed through the search field rather than picked from the open list: the
      // popover renders its options through a VIRTUALIZED renderer, which sizes its
      // window from a scroll height jsdom always reports as 0 and so materializes only
      // a couple of rows. Filtering to one match keeps the assertion about the dialog's
      // behaviour instead of the test environment's layout.
      await user.type(screen.getByPlaceholderText('com_ui_search_projects'), 'Weekly');
      await user.click(await screen.findByRole('option', { name: /Weekly Ops/ }));
      await user.click(screen.getByRole('button', { name: 'com_ui_create' }));

      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ chatProjectId: 'proj-1' }));
    });

    /** An unscoped schedule must not send `chatProjectId: ''` — the payload schema
     *  refuses an empty string, so the create would 400 rather than file loose. */
    it('omits the field entirely when no project is chosen', async () => {
      const user = userEvent.setup();
      renderDialog();
      await fillRequiredFields(user);

      await user.click(screen.getByRole('button', { name: 'com_ui_create' }));

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate.mock.calls[0][0]).not.toHaveProperty('chatProjectId');
    });

    /** The server refuses an unscoped create under this policy; blocking it here keeps
     *  the user from losing a filled-in form to a 400. */
    it('blocks submission when the deployment requires a project', async () => {
      mockLimits = { maxPerUser: 10, requireProject: true };
      const user = userEvent.setup();
      renderDialog();
      await fillRequiredFields(user);

      await user.click(screen.getByRole('button', { name: 'com_ui_create' }));

      expect(mockMutate).not.toHaveBeenCalled();
      expect(await screen.findByText('com_ui_field_required')).toBeInTheDocument();
    });

    /** The server accepts `chatProjectId: null` to clear a scope, but that path is only
     *  reachable if the picker offers something to select — a placeholder cannot be
     *  chosen, so without a real option a scoped schedule could never be unscoped. */
    it('can clear a stored project through a selectable No project option', async () => {
      const user = userEvent.setup();
      renderDialog(storedSchedule({ chatProjectId: 'proj-1' }));

      expect(screen.getByRole('combobox', { name: 'com_ui_project' })).toHaveTextContent(
        'Weekly Ops',
      );
      await user.click(screen.getByRole('combobox', { name: 'com_ui_project' }));
      await user.click(await screen.findByRole('option', { name: /com_ui_schedule_project_none/ }));
      await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ chatProjectId: null }) }),
      );
    });

    /** There is no "no project" to offer when one is mandatory. */
    it('offers no clearing option when a project is required', async () => {
      mockLimits = { maxPerUser: 10, requireProject: true };
      const user = userEvent.setup();
      renderDialog(storedSchedule({ chatProjectId: 'proj-1' }));

      await user.click(screen.getByRole('combobox', { name: 'com_ui_project' }));

      expect(
        screen.queryByRole('option', { name: /com_ui_schedule_project_none/ }),
      ).not.toBeInTheDocument();
    });

    /** A stored project outside the loaded page would otherwise render the placeholder —
     *  telling the owner a scoped schedule has no project. */
    it('names a stored project the paged list has not loaded', async () => {
      mockFetchedProject = { _id: 'proj-999', name: 'Archived Ops' };
      renderDialog(storedSchedule({ chatProjectId: 'proj-999' }));

      const picker = screen.getByRole('combobox', { name: 'com_ui_project' });
      expect(picker).toHaveTextContent('Archived Ops');
      expect(picker).not.toHaveTextContent('com_ui_schedule_project_none');
    });

    /** Even with no name available, the id beats claiming the schedule is unscoped. */
    it('falls back to the stored id rather than showing the empty placeholder', async () => {
      renderDialog(storedSchedule({ chatProjectId: 'proj-999' }));

      expect(screen.getByRole('combobox', { name: 'com_ui_project' })).toHaveTextContent(
        'proj-999',
      );
    });

    /** The server waives the requirement for an edit that leaves a schedule DISABLED,
     *  so a row auto-disabled for `project_required` can still be renamed. Requiring a
     *  project in the form made that unreachable — and an owner with no projects at all
     *  could not edit the stopped schedule. */
    it('lets a disabled unscoped schedule be edited while a project is required', async () => {
      mockLimits = { maxPerUser: 10, requireProject: true };
      const user = userEvent.setup();
      renderDialog(storedSchedule({ enabled: false, chatProjectId: undefined }));

      await user.clear(screen.getByPlaceholderText('com_ui_schedule_name_placeholder'));
      await user.type(screen.getByPlaceholderText('com_ui_schedule_name_placeholder'), 'Renamed');
      await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ name: 'Renamed' }) }),
      );
    });

    /** An ENABLED schedule still has to satisfy the requirement. */
    it('still requires a project when the edit leaves the schedule enabled', async () => {
      mockLimits = { maxPerUser: 10, requireProject: true };
      const user = userEvent.setup();
      renderDialog(storedSchedule({ enabled: true, chatProjectId: undefined }));

      await user.clear(screen.getByPlaceholderText('com_ui_schedule_name_placeholder'));
      await user.type(screen.getByPlaceholderText('com_ui_schedule_name_placeholder'), 'Renamed');
      await user.click(screen.getByRole('button', { name: 'com_ui_save' }));

      expect(mockMutate).not.toHaveBeenCalled();
      expect(await screen.findByText('com_ui_field_required')).toBeInTheDocument();
    });

    /** A pin is the server's decision. Offering a picker would only invite a choice
     *  the write handler rejects, so the dialog shows the destination instead — and
     *  sends nothing, leaving the pin authoritative even if it moved since the dialog
     *  opened. */
    it('shows a pinned project as read-only and never sends it', async () => {
      mockLimits = { maxPerUser: 10, requireProject: true, projectId: 'proj-2' };
      const user = userEvent.setup();
      renderDialog();
      await fillRequiredFields(user);

      expect(screen.getByTestId('schedule-project-pinned')).toHaveTextContent('Research');
      expect(screen.queryByRole('combobox', { name: 'com_ui_project' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'com_ui_create' }));

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate.mock.calls[0][0]).not.toHaveProperty('chatProjectId');
    });
  });
});
