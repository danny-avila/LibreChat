import { PrincipalType } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import type * as t from '~/admin/types';
import { scopeConfigFixture, scopeLayersFixture, valuesDataFixture } from '~/admin/test/layers';
import { ConfigValuesProvider } from '~/admin/contexts/ConfigValuesContext';
import { ConfigRow } from '../ConfigRow';

jest.mock('~/admin/hooks/useLocalize', () => ({
  useLocalize: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join('|')}` : key,
}));

jest.mock('~/admin/ui', () => ({
  Icon: (props: Record<string, unknown>) => <svg {...props} />,
}));

const PATH = 'balance.startBalance';

function values(overrides: Partial<t.ConfigValuesData> = {}): t.ConfigValuesData {
  return {
    configValues: { balance: { startBalance: 1000 } },
    editedValues: {},
    schemaDefaults: { [PATH]: 20000 },
    configuredPaths: new Set(),
    overridePaths: new Set(),
    pendingResets: new Set(),
    ...overrides,
  };
}

function renderRow(data: t.ConfigValuesData, props: Partial<t.ConfigRowProps> = {}) {
  return render(
    <ConfigValuesProvider value={data}>
      <ConfigRow
        title="Start balance"
        fieldId="balance-startBalance"
        fieldPath={PATH}
        permissions={{ canView: true, canEdit: true }}
        {...props}
      >
        <input id="balance-startBalance" />
      </ConfigRow>
    </ConfigValuesProvider>,
  );
}

const chipKinds = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-state-chip]')].map((el) =>
    el.getAttribute('data-state-chip'),
  );

describe('ConfigRow', () => {
  it('renders an unconfigured row at full opacity with no chip and a default hint', () => {
    const { container } = renderRow(values(), { defaultHint: '20000' });
    const row = container.querySelector('.settings-row') as HTMLElement;
    expect(row.className).not.toMatch(/opacity/);
    expect(chipKinds(container)).toEqual([]);
    expect(screen.getByText('com_admin_config_ui_default_hint:20000')).toBeTruthy();
    expect(row.dataset.marker).toBeUndefined();
  });

  it('marks a librechat.yaml value', () => {
    const { container } = renderRow(values({ configuredPaths: new Set([PATH]) }));
    expect(chipKinds(container)).toEqual(['yaml']);
  });

  it('marks an admin override and offers Reset', () => {
    const onResetField = jest.fn();
    const { container } = renderRow(
      values({ configuredPaths: new Set([PATH]), overridePaths: new Set([PATH]) }),
      { isDbOverride: true, onResetField },
    );
    expect(chipKinds(container)).toEqual(['override']);
    fireEvent.click(
      screen.getByRole('button', { name: 'com_admin_a11y_reset_to_default:Start balance' }),
    );
    expect(onResetField).toHaveBeenCalledWith(PATH);
  });

  it('names the profile on a scope override', () => {
    const { container } = renderRow(
      values({ overridePaths: new Set([PATH]), isEditingScope: true }),
      {
        previewScope: {
          principalType: PrincipalType.ROLE,
          principalId: 'USER',
          name: 'USER',
          priority: 1,
          isActive: true,
        },
      },
    );
    expect(chipKinds(container)).toEqual(['scope']);
    expect(container.querySelector('.state-chip-scope')?.textContent).toContain('USER');
  });

  it('marks an inherited value in profile mode', () => {
    const { container } = renderRow(values({ isEditingScope: true }));
    expect(chipKinds(container)).toEqual(['inherited']);
  });

  it('shows Edited with an Undo that discards the edit, instead of the provenance chip', () => {
    const onDiscardField = jest.fn();
    const { container } = renderRow(
      values({ configuredPaths: new Set([PATH]), editedValues: { [PATH]: 1234 } }),
      { onDiscardField },
    );
    expect(chipKinds(container)).toEqual(['edited']);
    expect((container.querySelector('.settings-row') as HTMLElement).dataset.marker).toBe('edited');
    fireEvent.click(
      screen.getByRole('button', { name: 'com_admin_config_ui_undo_change:Start balance' }),
    );
    expect(onDiscardField).toHaveBeenCalledWith(PATH);
  });

  it('says a pending unhide was hidden, and a pending hide what was inherited', () => {
    const hidden = scopeLayersFixture(
      scopeConfigFixture({ overrides: {}, changedPaths: [], tombstones: [PATH] }),
    );
    const unhide = renderRow({
      ...valuesDataFixture(hidden),
      visibilityEdits: { [PATH]: 'unhide' },
    });
    expect(unhide.container.querySelector('.state-chip-edited')?.getAttribute('title')).toBe(
      'com_admin_config_ui_state_edited_desc. com_admin_config_ui_state_edited_was_hidden',
    );
    unhide.unmount();
    const shown = scopeLayersFixture(scopeConfigFixture({ overrides: {}, changedPaths: [] }));
    const hide = renderRow({ ...valuesDataFixture(shown), visibilityEdits: { [PATH]: 'hide' } });
    expect(hide.container.querySelector('.state-chip-edited')?.getAttribute('title')).toMatch(
      /^com_admin_config_ui_state_edited_desc\. com_admin_config_ui_state_edited_was:2,500,000\|/,
    );
  });

  it('shows Pending revert with Undo and hides Reset while a reset is queued', () => {
    const onDiscardField = jest.fn();
    const { container } = renderRow(
      values({
        overridePaths: new Set([PATH]),
        editedValues: { [PATH]: undefined },
        pendingResets: new Set([PATH]),
      }),
      { isDbOverride: true, isPendingReset: true, onResetField: jest.fn(), onDiscardField },
    );
    expect(chipKinds(container)).toEqual(['pendingRevert']);
    expect((container.querySelector('.settings-row') as HTMLElement).dataset.marker).toBe(
      'pending',
    );
    expect(screen.queryByRole('button', { name: /com_admin_a11y_reset_to_default/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /com_admin_config_ui_undo_change/ }));
    expect(onDiscardField).toHaveBeenCalledWith(PATH);
  });

  it('shows an error chip, marker and message', () => {
    const { container } = renderRow(values(), { error: 'Must be positive' });
    expect(chipKinds(container)).toEqual(['error']);
    expect(screen.getByRole('alert').textContent).toBe('Must be positive');
    expect((container.querySelector('.settings-row') as HTMLElement).dataset.marker).toBe('error');
  });

  it('sizes the control from the value type and key', () => {
    const { container } = renderRow(values());
    expect(container.querySelector('.settings-row-control')?.getAttribute('data-width')).toBe('S');
  });

  it('renders nothing when hidden', () => {
    const { container } = renderRow(values(), { hidden: true });
    expect(container.innerHTML).toBe('');
  });
});
