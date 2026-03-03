import { render, screen } from '@testing-library/react';
import type { Endpoint, SelectedValues } from '~/common';
import { SearchResults } from '../SearchResults';

const mockHandleSelectSpec = jest.fn();
const mockHandleSelectModel = jest.fn();
const mockHandleSelectEndpoint = jest.fn();
let mockSelectedValues: SelectedValues;

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    selectedValues: mockSelectedValues,
    handleSelectSpec: mockHandleSelectSpec,
    handleSelectModel: mockHandleSelectModel,
    handleSelectEndpoint: mockHandleSelectEndpoint,
    endpointsConfig: {},
  }),
}));

jest.mock('~/components/Chat/Menus/Endpoints/CustomMenu', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    CustomMenuItem: React.forwardRef(function MockMenuItem(
      { children, ...rest }: { children?: React.ReactNode },
      ref: React.Ref<HTMLDivElement>,
    ) {
      return React.createElement('div', { ref, role: 'menuitem', ...rest }, children);
    }),
  };
});

jest.mock('../SpecIcon', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: () => React.createElement('span', null, 'icon'),
  };
});

const localize = (key: string) => key;

const anthropicEndpoint: Endpoint = {
  value: 'anthropic',
  label: 'Anthropic',
  hasModels: true,
  models: [{ name: 'claude-opus-4-6' }, { name: 'claude-sonnet-4-5' }],
  icon: null,
};

const noModelsEndpoint: Endpoint = {
  value: 'custom',
  label: 'Custom',
  hasModels: false,
  icon: null,
};

describe('SearchResults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks model as selected when endpoint and model match with no active spec', () => {
    mockSelectedValues = { endpoint: 'anthropic', model: 'claude-opus-4-6', modelSpec: '' };
    render(
      <SearchResults results={[anthropicEndpoint]} localize={localize} searchValue="claude" />,
    );

    const items = screen.getAllByRole('menuitem');
    const selectedItem = items.find((el) => el.getAttribute('aria-selected') === 'true');
    expect(selectedItem).toBeDefined();
    expect(selectedItem).toHaveTextContent('claude-opus-4-6');
  });

  it('does not mark model as selected when a spec is active', () => {
    mockSelectedValues = {
      endpoint: 'anthropic',
      model: 'claude-opus-4-6',
      modelSpec: 'my-spec',
    };
    render(
      <SearchResults results={[anthropicEndpoint]} localize={localize} searchValue="claude" />,
    );

    const items = screen.getAllByRole('menuitem');
    for (const item of items) {
      expect(item).not.toHaveAttribute('aria-selected');
    }
  });

  it('does not mark endpoint as selected when a spec is active', () => {
    mockSelectedValues = {
      endpoint: 'custom',
      model: '',
      modelSpec: 'my-spec',
    };
    render(<SearchResults results={[noModelsEndpoint]} localize={localize} searchValue="custom" />);

    const item = screen.getByRole('menuitem');
    expect(item).not.toHaveAttribute('aria-selected');
  });

  it('marks endpoint as selected when no spec is active and endpoint matches', () => {
    mockSelectedValues = { endpoint: 'custom', model: '', modelSpec: '' };
    render(<SearchResults results={[noModelsEndpoint]} localize={localize} searchValue="custom" />);

    const item = screen.getByRole('menuitem');
    expect(item).toHaveAttribute('aria-selected', 'true');
  });
});
