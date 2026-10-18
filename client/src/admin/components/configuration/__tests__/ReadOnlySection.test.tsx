import { render, screen, fireEvent } from '@testing-library/react';
import { ReadOnlySection } from '../ReadOnlySection';

jest.mock('~/admin/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useExpandSignal: () => undefined,
}));

describe('ReadOnlySection', () => {
  it('explains a base-only or librechat.yaml-only section above its values', () => {
    const { rerender } = render(
      <ReadOnlySection reason="baseOnly">
        <input aria-label="value" disabled defaultValue="42" />
      </ReadOnlySection>,
    );
    expect(screen.getByRole('note')).toHaveTextContent('com_admin_config_base_only_section');
    expect(screen.getByLabelText('value')).toHaveValue('42');
    rerender(<ReadOnlySection reason="yamlOnly" />);
    expect(screen.getByRole('note')).toHaveTextContent('com_admin_config_yaml_only_section');
  });

  it('offers Edit in Base for a section gated in a profile', () => {
    const onEditInBase = jest.fn();
    render(<ReadOnlySection reason="scope" onEditInBase={onEditInBase} />);
    expect(screen.getByRole('note')).toHaveTextContent('com_admin_config_shell_scope_gated');
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_config_shell_edit_in_base' }));
    expect(onEditInBase).toHaveBeenCalledTimes(1);
  });

  it('uses a custom message when given', () => {
    render(<ReadOnlySection reason="yamlOnly" message="Set in librechat.yaml" />);
    expect(screen.getByRole('note')).toHaveTextContent('Set in librechat.yaml');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('folds the rows of a section that sets nothing behind "Show all fields"', () => {
    render(
      <ReadOnlySection reason="yamlOnly" isEmpty>
        <input aria-label="value" disabled />
      </ReadOnlySection>,
    );
    expect(screen.queryByLabelText('value')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('com_admin_config_read_only_empty');
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_config_read_only_show_fields' }));
    expect(screen.getByLabelText('value')).toBeInTheDocument();
  });

  it('unfolds when a search or deep link reveals a field inside', () => {
    render(
      <ReadOnlySection reason="yamlOnly" isEmpty reveal>
        <input aria-label="value" disabled />
      </ReadOnlySection>,
    );
    expect(screen.getByLabelText('value')).toBeInTheDocument();
  });
});
