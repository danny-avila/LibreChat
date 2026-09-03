import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccessRoleIds, PrincipalType } from 'librechat-data-provider';
import type { TPrincipal } from 'librechat-data-provider';
import SelectedPrincipalsList from '../PeoplePicker/SelectedPrincipalsList';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('../AccessRolesPicker', () => ({
  __esModule: true,
  default: () => <div />,
}));

jest.mock('../PrincipalAvatar', () => ({
  __esModule: true,
  default: () => <div />,
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  TooltipAnchor: ({ render: trigger }: { render: React.ReactNode }) => trigger,
  useMediaQuery: () => false,
}));

describe('SelectedPrincipalsList', () => {
  it('keys Insights changes by role ID when source IDs are absent', () => {
    const roles: TPrincipal[] = [
      {
        type: PrincipalType.ROLE,
        id: 'role-one',
        name: 'Role One',
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      },
      {
        type: PrincipalType.ROLE,
        id: 'role-two',
        name: 'Role Two',
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      },
    ];
    const onInsightsAccessChange = jest.fn();

    render(
      <SelectedPrincipalsList
        principles={roles}
        onRemoveHandler={jest.fn()}
        onInsightsAccessChange={onInsightsAccessChange}
        showInsightsAccess
      />,
    );

    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    expect(onInsightsAccessChange).toHaveBeenCalledTimes(1);
    expect(onInsightsAccessChange).toHaveBeenCalledWith('role-role-two', true);
  });
});
