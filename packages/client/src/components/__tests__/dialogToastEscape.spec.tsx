import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import * as RadixToast from '@radix-ui/react-toast';
import { render, screen } from '@testing-library/react';
import { OGDialog, OGDialogContent } from '../OriginalDialog';

/**
 * Radix hands Escape to the highest dismissable layer only, and a toast
 * registers one above whatever dialog is already open. Sharing a single copy of
 * `react-dismissable-layer` puts both in the same stack, so a status toast on
 * screen swallowed the Escape that should have closed the dialog beneath it.
 */
function Harness({
  onOpenChange,
  toast,
}: {
  onOpenChange: (open: boolean) => void;
  toast: boolean;
}) {
  return (
    <RadixToast.Provider>
      <OGDialog open onOpenChange={onOpenChange}>
        <OGDialogContent>
          <button type="button">inside the dialog</button>
        </OGDialogContent>
      </OGDialog>
      {toast && (
        <RadixToast.Root open duration={Infinity} className="toast-root">
          <RadixToast.Description>Skill created</RadixToast.Description>
        </RadixToast.Root>
      )}
      <RadixToast.Viewport />
    </RadixToast.Provider>
  );
}

describe('dialog Escape', () => {
  it('closes the dialog while a toast is on screen', async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} toast />);

    screen.getByText('inside the dialog').focus();
    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('still closes the dialog with no toast up', async () => {
    const onOpenChange = jest.fn();
    render(<Harness onOpenChange={onOpenChange} toast={false} />);

    screen.getByText('inside the dialog').focus();
    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
