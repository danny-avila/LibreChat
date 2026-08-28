import { ToastProvider } from '@librechat/client';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import type { AgentForm } from '~/common';
import Instructions from '../Instructions';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

function InstructionsHarness() {
  const methods = useForm<AgentForm>({ defaultValues: { instructions: '' } });
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
});
