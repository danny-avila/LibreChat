import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsSection } from '../SettingsSection';
import { ConfigSection } from '../ConfigSection';
import { SettingsRow } from '../SettingsRow';

jest.mock('~/admin/hooks/useLocalize', () => ({
  useLocalize: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join('|')}` : key,
}));

jest.mock('~/admin/ui', () => ({
  Icon: ({ name, ...props }: { name: string } & Record<string, unknown>) => (
    <svg role="img" aria-label={name} {...props} />
  ),
}));

describe('SettingsSection', () => {
  it('renders a card as an h2 whose button controls the body', () => {
    const onToggle = jest.fn();
    render(
      <SettingsSection id="section-balance" title="Balance" expanded onToggle={onToggle}>
        <p>{'Body'}</p>
      </SettingsSection>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Balance' });
    const button = screen.getByRole('button', { name: 'Balance' });
    expect(heading.contains(button)).toBe(true);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Balance' }).id).toBe('section-balance');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('nests heading levels: card h2 > group h3 > group h4', () => {
    render(
      <SettingsSection title="Rate limits">
        <SettingsSection title="File uploads" variant="group">
          <SettingsSection title="Per user" variant="group">
            <p>{'Body'}</p>
          </SettingsSection>
        </SettingsSection>
      </SettingsSection>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Rate limits' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'File uploads' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Per user' })).toBeTruthy();
  });

  it('keeps chevron icon names out of the button name', () => {
    render(
      <SettingsSection title="Agent events" variant="group" expanded={false}>
        <p>{'Body'}</p>
      </SettingsSection>,
    );
    expect(screen.getByRole('button', { name: 'Agent events' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders a static heading and an always-open body when not collapsible', () => {
    render(
      <SettingsSection title="Messages" variant="group" collapsible={false}>
        <p>{'Always shown'}</p>
      </SettingsSection>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Messages' })).toBeTruthy();
    expect(screen.getByText('Always shown')).toBeTruthy();
  });
});

describe('ConfigSection', () => {
  it('reads the count badge as "N of M set"', () => {
    render(
      <ConfigSection sectionId="balance" title="Balance" configuredCount={3} totalCount={7}>
        <p>{'Body'}</p>
      </ConfigSection>,
    );
    expect(
      /* jsdom's name computation spaces the inline badge from the title. */
      screen.getByRole('button', { name: /^Balances*, com_admin_config_ui_count:3|7$/ }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('expands and collapses on config:expand / config:collapse events', () => {
    render(
      <ConfigSection sectionId="ocr" title="OCR" defaultExpanded={false}>
        <p>{'Body'}</p>
      </ConfigSection>,
    );
    const button = screen.getByRole('button', { name: 'OCR' });
    const section = document.getElementById('section-ocr') as HTMLElement;
    fireEvent(section, new Event('config:expand'));
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent(section, new Event('config:collapse'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a configured section once its count arrives', () => {
    const { rerender } = render(
      <ConfigSection sectionId="openAI" title="OpenAI" configuredCount={0} totalCount={30}>
        <p>{'Body'}</p>
      </ConfigSection>,
    );
    expect(screen.getByRole('button', { name: /OpenAI/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    rerender(
      <ConfigSection sectionId="openAI" title="OpenAI" configuredCount={3} totalCount={30}>
        <p>{'Body'}</p>
      </ConfigSection>,
    );
    expect(screen.getByRole('button', { name: /OpenAI/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders a single-field section as one row headed by an h2, without a second label', () => {
    const { container } = render(
      <ConfigSection
        sectionId="transactions"
        title="Transactions"
        description="Token ledger"
        inline
      >
        <SettingsRow
          label="Enabled"
          htmlFor="transactions-enabled"
          control={<input id="transactions-enabled" type="checkbox" aria-label="Enabled" />}
        />
      </ConfigSection>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Transactions' })).toBeTruthy();
    expect(screen.getByText('Token ledger')).toBeTruthy();
    expect(screen.queryByText('Enabled', { selector: 'label' })).toBeNull();
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      'com_admin_config_ui_sole_name:Transactions|Enabled',
    );
    const row = container.querySelector('.settings-section-sole > .settings-row');
    expect(row?.querySelector(':scope > .settings-row-sole > .settings-row-control')).toBeTruthy();
  });
});
