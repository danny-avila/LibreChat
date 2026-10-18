import { render, screen } from '@testing-library/react';
import { SoleFieldContext } from '~/admin/contexts/SettingsContext';
import { SettingsRow } from '../SettingsRow';

jest.mock('~/admin/hooks/useLocalize', () => ({
  useLocalize: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join('|')}` : key,
}));

describe('SettingsRow', () => {
  it('renders every slot in its grid cell', () => {
    const { container } = render(
      <SettingsRow
        label="Start balance"
        htmlFor="balance-startBalance"
        description="Credits granted to new users"
        control={<input id="balance-startBalance" aria-describedby="balance-startBalance-error" />}
        chips={<span data-testid="chip" />}
        hint={<span>{'default: 0'}</span>}
        actions={<button type="button">{'Reset'}</button>}
        error="Must be a number"
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('settings-row');
    expect(screen.getByLabelText('Start balance')).toBeInstanceOf(HTMLInputElement);

    const label = row.querySelector('.settings-row-label');
    expect(label?.textContent).toContain('default: 0');
    expect(label?.textContent).toContain('Credits granted to new users');

    const controlCell = row.querySelector('.settings-row-control');
    expect(controlCell?.querySelector('input')).toBeTruthy();
    expect(screen.getByRole('alert').parentElement).toBe(controlCell);
    expect(screen.getByRole('alert').id).toBe('balance-startBalance-error');
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Must be a number');

    const trailing = row.querySelector('.settings-row-trailing');
    expect(trailing?.contains(screen.getByTestId('chip'))).toBe(true);
    expect(trailing?.contains(screen.getByRole('button', { name: 'Reset' }))).toBe(true);
  });

  it('never fades a row and omits the trailing cell when it has no chips or actions', () => {
    const { container } = render(
      <SettingsRow label="Cache" control={<input aria-label="Cache" />} />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).not.toMatch(/opacity/);
    expect(row.style.opacity).toBe('');
    expect(row.querySelector('.settings-row-trailing')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(row.querySelector('.settings-row-control')?.getAttribute('data-width')).toBe('auto');
  });

  it('applies the width token, the required mark and the pending-change marker', () => {
    const { container } = render(
      <SettingsRow
        label="Base URL"
        control={<input aria-label="Base URL" />}
        width="L"
        marker="edited"
        required
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.dataset.marker).toBe('edited');
    expect(row.querySelector('.settings-row-control')?.getAttribute('data-width')).toBe('L');
    expect(row.querySelector('.settings-required')?.textContent).toBe('*');
  });

  it('in a single-field section, drops the label and names the control after the section', () => {
    render(
      <SoleFieldContext.Provider value={{ headingId: 'h-tx', sectionTitle: 'Transactions' }}>
        <h2 id="h-tx">{'Transactions'}</h2>
        <SettingsRow
          label="Enabled"
          htmlFor="transactions-enabled"
          control={
            <button
              type="button"
              role="switch"
              aria-checked
              id="transactions-enabled"
              aria-label="Enabled"
            />
          }
          chips={<span data-testid="chip" />}
        />
      </SoleFieldContext.Provider>,
    );
    expect(screen.queryByText('Enabled', { selector: 'label' })).toBeNull();
    expect(screen.getByRole('switch')).toHaveAccessibleName(
      'com_admin_config_ui_sole_name:Transactions|Enabled',
    );
    expect(screen.getByTestId('chip').closest('.settings-row-trailing')).toBeTruthy();
  });

  it('uses the section title alone when the field label repeats it', () => {
    render(
      <SoleFieldContext.Provider value={{ headingId: 'h-sil', sectionTitle: 'Secure image links' }}>
        <SettingsRow
          label="Secure image links"
          htmlFor="secureImageLinks"
          control={<input id="secureImageLinks" type="checkbox" />}
        />
      </SoleFieldContext.Provider>,
    );
    expect(screen.getByRole('checkbox')).toHaveAccessibleName('Secure image links');
  });
});
