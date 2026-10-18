import { fireEvent, render, screen } from '@testing-library/react';
import { FormDialog } from '../FormDialog';

jest.mock('~/admin/hooks/useLocalize', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('FormDialog', () => {
  const renderDialog = (props: Partial<React.ComponentProps<typeof FormDialog>> = {}) =>
    render(
      <FormDialog
        open
        title="Create MCP server"
        submitLabel="Create"
        onSubmit={jest.fn()}
        onClose={jest.fn()}
        {...props}
      >
        <label htmlFor="name">{'Name'}</label>
        <input id="name" />
      </FormDialog>,
    );

  it('scrolls only the fields: the footer with the actions sits outside the scroll body', () => {
    renderDialog({ error: 'Name is required' });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('form-dialog-content');
    const body = dialog.querySelector('.form-dialog-body') as HTMLElement;
    const footer = dialog.querySelector('.form-dialog-footer') as HTMLElement;
    expect(body.contains(screen.getByLabelText('Name'))).toBe(true);
    expect(body.contains(screen.getByRole('button', { name: 'Create' }))).toBe(false);
    expect(footer.contains(screen.getByRole('button', { name: 'Create' }))).toBe(true);
    expect(footer.contains(screen.getByRole('alert'))).toBe(true);
  });

  it('submits on Enter in a field and cancels through the footer', () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    renderDialog({ onSubmit, onClose });
    fireEvent.submit(screen.getByLabelText('Name'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
