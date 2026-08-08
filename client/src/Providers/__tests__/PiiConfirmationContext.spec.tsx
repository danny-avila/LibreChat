import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  PiiConfirmationProvider,
  usePiiConfirmation,
} from '../PiiConfirmationContext';

jest.mock('~/hooks/useLocalize', () => () => (key: string) => key);

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  OGDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <div data-testid="simulate-dialog-dismiss" onClick={() => onOpenChange(false)} />
      </div>
    ) : null,
  OGDialogTemplate: ({
    buttons,
    showCancelButton = true,
  }: {
    buttons: ReactNode;
    showCancelButton?: boolean;
  }) => (
    <div>
      {showCancelButton ? <button type="button">com_ui_cancel</button> : null}
      {buttons}
    </div>
  ),
}));

function Consumer() {
  const { requestPiiAction } = usePiiConfirmation();
  const [result, setResult] = useState('pending');

  return (
    <>
      <button
        type="button"
        onClick={() => requestPiiAction(['EMAIL_ADDRESS']).then((action) => setResult(action ?? 'null'))}
      >
        request-confirmation
      </button>
      <output>{result}</output>
    </>
  );
}

describe('PiiConfirmationProvider', () => {
  it('renders only the two PII decisions and ignores dialog dismissal', async () => {
    render(
      <PiiConfirmationProvider>
        <Consumer />
      </PiiConfirmationProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'request-confirmation' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByRole('button', { name: 'com_ui_cancel' })).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'com_ui_pii_send_as_is' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'com_ui_pii_anonymize' }),
    ).toBeInTheDocument();

    expect(within(dialog).getAllByRole('button')).toHaveLength(2);

    fireEvent.click(within(dialog).getByTestId('simulate-dialog-dismiss'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'com_ui_pii_send_as_is',
      }),
    );
    expect(await screen.findByText('send_as_is')).toBeInTheDocument();
  });
});
