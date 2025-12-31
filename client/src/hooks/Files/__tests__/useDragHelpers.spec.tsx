import { render } from '@testing-library/react';
import useDragHelpers from '~/hooks/Files/useDragHelpers';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import store from '~/store';

jest.mock('~/hooks/Files/useFileHandling', () => {
  return jest.fn(() => ({
    handleFiles: jest.fn(),
  }));
});

const mockUseFileHandling = jest.requireMock('~/hooks/Files/useFileHandling');

function DragHelpersTest() {
  useDragHelpers();
  return null;
}

describe('useDragHelpers()', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderDragHelper = (props: any = {}, initialRecoilState?: (MutableSnapshot) => void) => {
    return render(
      <DndProvider backend={HTML5Backend}>
        <QueryClientProvider client={queryClient}>
          <RecoilRoot initializeState={initialRecoilState}>
            <DragHelpersTest {...props} />
          </RecoilRoot>
        </QueryClientProvider>
      </DndProvider>,
    );
  };

  test('should pass additional metadata w/ temporary status to file handler', () => {
    renderDragHelper({}, ({ set }) => set(store.isTemporary, true));

    expect(mockUseFileHandling).toHaveBeenCalledWith({
      additionalMetadata: { temporary: 'true' },
    });
  });
});
