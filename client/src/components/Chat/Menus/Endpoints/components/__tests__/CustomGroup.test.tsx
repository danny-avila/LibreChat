import { render, screen } from '@testing-library/react';
import type { TModelSpec } from 'librechat-data-provider';
import { CustomGroup } from '../CustomGroup';

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    selectedValues: { endpoint: '', model: '', modelSpec: 'spec-b' },
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFavorites: () => ({
    isFavoriteSpec: () => false,
    toggleFavoriteSpec: jest.fn(),
  }),
  useIsActiveItem: () => ({ ref: { current: null }, isActive: false }),
}));

jest.mock('../SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
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
    CustomMenuItem: React.forwardRef(function MockMenuItem(
      { children, ...rest }: { children?: React.ReactNode },
      ref: React.Ref<HTMLDivElement>,
    ) {
      return React.createElement('div', { ref, role: 'menuitem', ...rest }, children);
    }),
  };
});

const specs: TModelSpec[] = [
  { name: 'spec-a', label: 'Spec A', preset: { endpoint: 'openai', model: 'gpt-5' } },
  { name: 'spec-b', label: 'Spec B', preset: { endpoint: 'openai', model: 'gpt-5' } },
];

describe('CustomGroup', () => {
  it('renders nothing when specs is empty', () => {
    const { container } = render(<CustomGroup groupName="Empty" specs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the group name and every spec row', () => {
    render(<CustomGroup groupName="My Group" specs={specs} />);
    expect(screen.getByText('My Group')).toBeInTheDocument();
    expect(screen.getByText('Spec A')).toBeInTheDocument();
    expect(screen.getByText('Spec B')).toBeInTheDocument();
  });

  it('marks the selected spec row as selected', () => {
    render(<CustomGroup groupName="My Group" specs={specs} />);
    const rows = screen.getAllByRole('menuitem');
    expect(rows[1]).toHaveAttribute('aria-selected', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-selected');
  });
});
