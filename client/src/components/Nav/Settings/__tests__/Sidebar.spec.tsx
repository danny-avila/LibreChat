import userEvent from '@testing-library/user-event';
import * as Tabs from '@radix-ui/react-tabs';
import { SettingsTabValues } from 'librechat-data-provider';
import { render, screen } from 'test/layout-test-utils';
import Sidebar from '../Sidebar';
import type { SettingsContextValue } from '../types';

const ctx: SettingsContextValue = {
  balanceEnabled: false,
  hasAnyPersonalizationFeature: false,
  hasMemoryOptOut: false,
  hasRemoteAgents: false,
  hasMultiConvo: false,
  hasPrompts: false,
  isLocalProvider: true,
  twoFactorEnabled: false,
  allowAccountDeletion: true,
};

function setup(extra: Partial<SettingsContextValue> = {}) {
  const onQueryChange = jest.fn();
  render(
    <Tabs.Root value={SettingsTabValues.GENERAL}>
      <Sidebar
        ctx={{ ...ctx, ...extra }}
        query=""
        onQueryChange={onQueryChange}
        onSelectTab={jest.fn()}
      />
    </Tabs.Root>,
  );
  return { onQueryChange };
}

describe('Sidebar', () => {
  it('hides the Personalization tab when the feature is off', () => {
    setup();
    expect(screen.queryByText('Personalization')).not.toBeInTheDocument();
  });

  it('shows the Personalization tab when enabled', () => {
    setup({ hasAnyPersonalizationFeature: true });
    expect(screen.getByText('Personalization')).toBeInTheDocument();
  });

  it('forwards typing to onQueryChange', async () => {
    const { onQueryChange } = setup();
    await userEvent.type(screen.getByRole('searchbox'), 'theme');
    expect(onQueryChange).toHaveBeenCalled();
  });
});
