import { createElement } from 'react';
import { ToastProvider } from '@librechat/client';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

jest.mock('~/data-provider', () => ({
  useListAgentsQuery: () => ({
    data: [
      { id: 'agent-1', name: 'Research Agent' },
      { id: 'agent-2', name: 'Digest Agent' },
    ],
  }),
  useCreateScheduleMutation: () => ({ mutate: mockMutate, isLoading: false }),
  useUpdateScheduleMutation: () => ({ mutate: mockMutate, isLoading: false }),
}));

const renderDialog = () => {
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
  return render(<ScheduleDialog open={true} onOpenChange={jest.fn()} />, { wrapper: Wrapper });
};

describe('ScheduleDialog', () => {
  afterEach(() => jest.clearAllMocks());

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

  it('offers the special-variable menu on the prompt field', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'com_ui_variables' }));
    expect(
      await screen.findByRole('menuitem', { name: 'com_ui_special_var_current_date' }),
    ).toBeInTheDocument();
  });
});
