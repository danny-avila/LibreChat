import { render, screen } from '@testing-library/react';
import type { FavoriteGroup } from '../../resolveFavorites';
import { FavoritesSection } from '../FavoritesSection';

let mockGroups: FavoriteGroup[] = [];

let mockContextValues = {
  modelSpecs: [],
  mappedEndpoints: [],
  agentsMap: {},
  selectedValues: { endpoint: '', model: '', modelSpec: '' },
  handleSelectSpec: jest.fn(),
  handleSelectModel: jest.fn(),
  endpointsConfig: {},
};

let mockFavoritesValues = {
  favorites: [],
  isFavoriteSpec: (name: string) => false,
  toggleFavoriteSpec: jest.fn(),
  isFavoriteModel: (model: string, endpoint: string) => false,
  toggleFavoriteModel: jest.fn(),
  isFavoriteAgent: (model: string) => false,
  toggleFavoriteAgent: jest.fn(),
};

jest.mock('../../resolveFavorites', () => ({
  ...jest.requireActual('../../resolveFavorites'),
  resolveFavoriteGroups: () => mockGroups,
}));

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => mockContextValues,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFavorites: () => mockFavoritesValues,
  useIsActiveItem: () => ({ ref: { current: null }, isActive: false }),
}));

jest.mock('../SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
}));

jest.mock('../GroupIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="group-icon" />,
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

jest.mock('../SpecDescription', () => ({
  __esModule: true,
  default: ({ description }: { description?: string }) =>
    description ? <span>{description}</span> : null,
}));

const specItem: FavoriteGroup = {
  key: 'OpenRouter',
  label: 'OpenRouter',
  items: [
    {
      type: 'spec',
      spec: {
        name: 'hermes-3-70b',
        label: 'Hermes 3 70B',
        group: 'OpenRouter',
        preset: { endpoint: 'OpenRouter', model: 'nousresearch/hermes-3-llama-3.1-70b' },
      },
    },
  ],
};

const modelItem: FavoriteGroup = {
  key: 'openAI',
  label: 'OpenAI',
  items: [
    {
      type: 'model',
      endpoint: { value: 'openAI', label: 'OpenAI', models: [{ name: 'gpt-4o' }] } as never,
      modelId: 'gpt-4o',
    },
  ],
};

const agentItem: FavoriteGroup = {
  key: '__agents__',
  label: 'Agents',
  items: [
    {
      type: 'model',
      endpoint: { value: 'agents', label: 'Agents', models: [{ name: 'agent-1' }] } as never,
      modelId: 'agent-1',
    },
  ],
};

const otherItem: FavoriteGroup = {
  key: '__other__',
  label: 'Other',
  items: [
    {
      type: 'spec',
      spec: {
        name: 'ungrouped-spec',
        label: 'Ungrouped Spec',
        preset: { endpoint: 'openAI', model: 'gpt-5' },
      },
    },
  ],
};

describe('FavoritesSection', () => {
  beforeEach(() => {
    mockGroups = [];
    mockContextValues = {
      modelSpecs: [],
      mappedEndpoints: [],
      agentsMap: {},
      selectedValues: { endpoint: '', model: '', modelSpec: '' },
      handleSelectSpec: jest.fn(),
      handleSelectModel: jest.fn(),
      endpointsConfig: {},
    };
    mockFavoritesValues = {
      favorites: [],
      isFavoriteSpec: (name: string) => false,
      toggleFavoriteSpec: jest.fn(),
      isFavoriteModel: (model: string, endpoint: string) => false,
      toggleFavoriteModel: jest.fn(),
      isFavoriteAgent: (model: string) => false,
      toggleFavoriteAgent: jest.fn(),
    };
  });

  it('renders nothing when there are no favorite groups', () => {
    mockGroups = [];
    const { container } = render(<FavoritesSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the "My Favorites" heading when there is at least one group', () => {
    mockGroups = [specItem];
    render(<FavoritesSection />);
    expect(screen.getByText('com_ui_my_favorites')).toBeInTheDocument();
  });

  it('renders a provider sub-header and its spec row', () => {
    mockGroups = [specItem];
    render(<FavoritesSection />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText('Hermes 3 70B')).toBeInTheDocument();
  });

  it('renders multiple provider groups, each with their own rows', () => {
    mockGroups = [specItem, modelItem];
    render(<FavoritesSection />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
    expect(screen.getByText('Hermes 3 70B')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('renders the localized label for the Agents bucket, not the raw "Agents" string', () => {
    mockGroups = [agentItem];
    render(<FavoritesSection />);
    expect(screen.getByText('com_ui_favorites_agents_group')).toBeInTheDocument();
    expect(screen.queryByText('Agents')).not.toBeInTheDocument();
  });

  it('renders the localized label for the Other bucket, not the raw "Other" string', () => {
    mockGroups = [otherItem];
    render(<FavoritesSection />);
    expect(screen.getByText('com_ui_favorites_other_group')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  it('marks the selected spec row as selected', () => {
    mockContextValues.selectedValues = {
      endpoint: '',
      model: '',
      modelSpec: 'hermes-3-70b',
    };
    mockGroups = [specItem];
    render(<FavoritesSection />);
    const rows = screen.getAllByRole('menuitem');
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('does not mark an unselected spec row as selected', () => {
    mockGroups = [specItem];
    render(<FavoritesSection />);
    const rows = screen.getAllByRole('menuitem');
    expect(rows[0]).not.toHaveAttribute('aria-selected');
  });

  it('shows the unpin button for a favorited spec', () => {
    mockFavoritesValues.isFavoriteSpec = (name: string) => name === 'hermes-3-70b';
    mockGroups = [specItem];
    render(<FavoritesSection />);
    expect(screen.getByRole('button', { name: 'com_ui_unpin' })).toBeInTheDocument();
  });

  it('shows the pin button for a non-favorited spec', () => {
    mockGroups = [specItem];
    render(<FavoritesSection />);
    expect(screen.getByRole('button', { name: 'com_ui_pin' })).toBeInTheDocument();
  });
});
