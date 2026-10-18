import { fireEvent, render, screen } from '@testing-library/react';
import { DecorativeIcon } from '../DecorativeIcon';
import { CountBadge } from '../CountBadge';
import { StateChip } from '../StateChip';

jest.mock('~/admin/hooks/useLocalize', () => ({
  useLocalize: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join('|')}` : key,
}));

jest.mock('~/admin/ui', () => ({
  Icon: ({ name, ...props }: { name: string } & Record<string, unknown>) => (
    <svg role="img" aria-label={name} {...props} />
  ),
}));

describe('DecorativeIcon', () => {
  it('hides the icon from assistive technology', () => {
    const { container } = render(
      <button type="button">
        <DecorativeIcon name="chevron-right" size="sm" />
        {'Expand all'}
      </button>,
    );
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('role')).toBe(false);
    expect(svg.hasAttribute('aria-label')).toBe(false);
    expect(screen.getByRole('button')).toHaveAccessibleName('Expand all');
  });
});

describe('StateChip', () => {
  it.each([
    ['yaml', 'com_admin_config_ui_state_yaml'],
    ['override', 'com_admin_config_ui_state_override'],
    ['inherited', 'com_admin_config_ui_state_inherited'],
    ['error', 'com_admin_config_ui_state_error'],
  ] as const)('labels the %s state', (kind, label) => {
    const { container } = render(<StateChip kind={kind} />);
    expect(container.textContent).toBe(label);
    expect(container.querySelector(`.state-chip-${kind}`)).toBeTruthy();
  });

  it('marks pending states with a dot and offers Undo', () => {
    const onUndo = jest.fn();
    const { container } = render(
      <StateChip
        kind="edited"
        description="Unsaved change"
        onUndo={onUndo}
        undoLabel="Undo change to Cache"
      />,
    );
    expect(container.querySelector('.state-chip-dot')).toBeTruthy();
    expect(screen.getByText(', Unsaved change')).toHaveClass('sr-only');
    fireEvent.click(screen.getByRole('button', { name: 'Undo change to Cache' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('uses a custom label', () => {
    render(<StateChip kind="scope" label="USER" />);
    expect(screen.getByText('USER')).toBeTruthy();
  });
});

describe('CountBadge', () => {
  it('reads as "N of M set" and renders nothing without a total', () => {
    const { container, rerender } = render(<CountBadge configured={3} total={29} />);
    expect(container.textContent).toBe(', com_admin_config_ui_count:3|29');
    expect(container.firstElementChild).toHaveAttribute('title', 'com_admin_config_ui_count_desc');
    expect(container.firstElementChild).toHaveClass('config-count-badge-active');
    rerender(<CountBadge configured={0} total={4} />);
    expect(container.firstElementChild).toHaveClass('config-count-badge-muted');
    rerender(<CountBadge configured={0} total={0} />);
    expect(container.innerHTML).toBe('');
  });
});
