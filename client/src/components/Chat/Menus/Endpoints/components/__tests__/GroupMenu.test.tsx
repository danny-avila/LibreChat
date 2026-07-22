import { render, screen } from '@testing-library/react';
import GroupMenu from '../GroupMenu';

jest.mock('../GroupIcon', () => ({
  __esModule: true,
  default: ({ groupName }: { groupName: string }) => (
    <span data-testid="group-icon">{groupName}</span>
  ),
}));

jest.mock('~/components/Chat/Menus/Endpoints/CustomMenu', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    CustomMenu: React.forwardRef(function MockMenu(
      { children, label, ...rest }: { children?: React.ReactNode; label?: React.ReactNode },
      ref: React.Ref<HTMLDivElement>,
    ) {
      return React.createElement(
        'div',
        { ref, role: 'group', ...rest },
        label,
        children,
      );
    }),
  };
});

describe('GroupMenu', () => {
  it('renders the group name and children', () => {
    render(
      <GroupMenu id="test-menu" groupName="My Group">
        <div>child content</div>
      </GroupMenu>,
    );
    expect(screen.getByText('My Group')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('does not render a GroupIcon when groupIcon is not provided', () => {
    render(
      <GroupMenu id="test-menu" groupName="My Group">
        <div>child</div>
      </GroupMenu>,
    );
    expect(screen.queryByTestId('group-icon')).not.toBeInTheDocument();
  });

  it('renders a GroupIcon when groupIcon is provided', () => {
    render(
      <GroupMenu id="test-menu" groupName="My Group" groupIcon="https://example.com/icon.png">
        <div>child</div>
      </GroupMenu>,
    );
    expect(screen.getByTestId('group-icon')).toBeInTheDocument();
  });
});
