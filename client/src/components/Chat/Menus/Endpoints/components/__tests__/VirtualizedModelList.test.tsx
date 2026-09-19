import { render, screen } from '@testing-library/react';
import type { ListRowProps } from 'react-virtualized';
import type { ForwardedRef, ReactNode } from 'react';
import type { Endpoint } from '~/common';
import VirtualizedModelList from '../VirtualizedModelList';

type MockListProps = {
  width: number;
  rowCount: number;
  rowRenderer: (props: ListRowProps) => ReactNode;
};

jest.mock('react-virtualized', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AutoSizer: ({ children }: { children: (size: { width: number }) => ReactNode }) =>
      children({ width: 280 }),
    List: React.forwardRef(function MockList(
      { width, rowCount, rowRenderer }: MockListProps,
      _ref: ForwardedRef<unknown>,
    ) {
      return React.createElement(
        'div',
        { 'data-testid': 'virtual-list', 'data-width': width, 'data-row-count': rowCount },
        [0, 1].map((index) =>
          rowRenderer({
            index,
            key: `row-${index}`,
            style: { height: 36, top: index * 36 },
            isScrolling: false,
            isVisible: true,
            columnIndex: 0,
            parent: {} as ListRowProps['parent'],
          }),
        ),
      );
    }),
  };
});

jest.mock('@ariakit/react', () => ({
  useComboboxContext: () => null,
}));

jest.mock('../EndpointModelItem', () => ({
  EndpointModelItem: ({ modelId }: { modelId: string }) => (
    <div role="option" aria-selected="false" data-testid={`model-${modelId}`}>
      {modelId}
    </div>
  ),
}));

const endpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  models: [],
  icon: null,
};

describe('VirtualizedModelList', () => {
  it('uses measured container width and mounts only the rendered window', () => {
    const modelIds = Array.from({ length: 101 }, (_, index) => `agent-${index}`);
    render(
      <VirtualizedModelList
        endpoint={endpoint}
        modelIds={modelIds}
        globalByName={new Map()}
        isFavorite={() => false}
        onToggleFavorite={() => undefined}
        precedingOptionCount={0}
      />,
    );

    const list = screen.getByTestId('virtual-list');
    expect(list).toHaveAttribute('data-width', '280');
    expect(list).toHaveAttribute('data-row-count', '101');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByTestId('model-agent-0')).toBeInTheDocument();
    expect(screen.getByTestId('model-agent-1')).toBeInTheDocument();
    expect(screen.queryByTestId('model-agent-100')).not.toBeInTheDocument();
  });
});
