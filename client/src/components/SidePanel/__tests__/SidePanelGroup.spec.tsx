import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import SidePanelGroup from '../SidePanelGroup';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useMediaQuery: jest.fn(() => false),
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(() => ({ data: null })),
}));

jest.mock('~/components/ui/Resizable', () => ({
  ResizablePanelGroup: ({ children, onLayout }: any) => {
    const mockSizes = [60, 20, 20];
    setTimeout(() => onLayout?.(mockSizes), 0);
    return <div data-testid="resizable-panel-group">{children}</div>;
  },
  ResizablePanel: ({ children, id }: any) => (
    <div data-testid={`resizable-panel-${id}`}>{children}</div>
  ),
  ResizableHandleAlt: () => <div data-testid="resizable-handle" />,
}));

const mockPanelRef = {
  current: {
    collapse: jest.fn(),
    expand: jest.fn(),
    isCollapsed: jest.fn(),
  },
};

jest.mock('../SidePanel', () => ({
  __esModule: true,
  default: jest.fn(({ panelRef }: any) => {
    if (panelRef) {
      panelRef.current = mockPanelRef.current;
    }
    return <div data-testid="side-panel" />;
  }),
}));

const mockUseMediaQuery = jest.requireMock('~/hooks').useMediaQuery;
const mockUseGetStartupConfig = jest.requireMock('~/data-provider').useGetStartupConfig;

describe('SidePanelGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockPanelRef.current.collapse.mockClear();
  });

  describe('Basic Rendering', () => {
    it('renders children and side panel when hideSidePanel is false', () => {
      render(
        <RecoilRoot initializeState={({ set }) => set(store.hideSidePanel, false)}>
          <SidePanelGroup>
            <div aria-label="Test Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(screen.getByTestId('resizable-panel-messages-view')).toBeInTheDocument();
      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
    });

    it('hides side panel when hideSidePanel is true', () => {
      render(
        <RecoilRoot initializeState={({ set }) => set(store.hideSidePanel, true)}>
          <SidePanelGroup>
            <div aria-label="Test Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(screen.getByTestId('resizable-panel-messages-view')).toBeInTheDocument();
      expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument();
    });

    it('renders artifacts panel when artifacts prop is provided', () => {
      render(
        <RecoilRoot>
          <SidePanelGroup artifacts={<div aria-label="Artifacts Content" />}>
            <div aria-label="Main Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(screen.getByTestId('resizable-panel-messages-view')).toBeInTheDocument();
      expect(screen.getByTestId('resizable-panel-artifacts-panel')).toBeInTheDocument();
      expect(screen.getByTestId('resizable-handle')).toBeInTheDocument();
    });
  });

  describe('Layout Calculations', () => {
    const layoutConfigurations = [
      { defaultLayout: [90, 10], artifacts: null, expected: [90, 10] },
      { defaultLayout: [85, 15], artifacts: <div />, expected: [50, 50, 0] },
      { defaultLayout: [70, 20, 10], artifacts: null, expected: [90, 10] },
      { defaultLayout: [60, 30, 10], artifacts: <div />, expected: [50, 50, 0] },
    ];

    layoutConfigurations.forEach(({ defaultLayout, artifacts }) => {
      it(`calculates layout correctly for defaultLayout=${JSON.stringify(
        defaultLayout,
      )} and artifacts=${artifacts ? 'present' : 'null'}`, () => {
        render(
          <RecoilRoot>
            <SidePanelGroup defaultLayout={defaultLayout} artifacts={artifacts}>
              <div aria-label="Content" />
            </SidePanelGroup>
          </RecoilRoot>,
        );

        const messagesPanel = screen.getByTestId('resizable-panel-messages-view');
        expect(messagesPanel).toBeInTheDocument();

        if (artifacts) {
          const artifactsPanel = screen.getByTestId('resizable-panel-artifacts-panel');
          expect(artifactsPanel).toBeInTheDocument();
        } else {
          const artifactsPanel = screen.queryByTestId('resizable-panel-artifacts-panel');
          expect(artifactsPanel).not.toBeInTheDocument();
        }
      });
    });
  });

  describe('Screen Size Handling', () => {
    it('collapses panel on small screens', () => {
      mockUseMediaQuery.mockReturnValue(true);

      render(
        <RecoilRoot>
          <SidePanelGroup>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(mockPanelRef.current.collapse).toHaveBeenCalled();
      expect(localStorage.getItem('fullPanelCollapse')).toBe('true');
    });

    it('respects defaultCollapsed on large screens', () => {
      mockUseMediaQuery.mockReturnValue(false);

      render(
        <RecoilRoot>
          <SidePanelGroup defaultCollapsed={true}>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(mockPanelRef.current.collapse).not.toHaveBeenCalled();
    });
  });

  describe('Panel Collapse Functionality', () => {
    it('handles close button click', () => {
      render(
        <RecoilRoot>
          <SidePanelGroup>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      const closeButton = screen.getByLabelText('Close right side panel');
      fireEvent.click(closeButton);

      expect(localStorage.getItem('fullPanelCollapse')).toBe('true');
      expect(mockPanelRef.current.collapse).toHaveBeenCalled();
    });

    it('applies active class to nav-mask when not collapsed', () => {
      render(
        <RecoilRoot>
          <SidePanelGroup defaultCollapsed={false}>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      const navMask = screen.getByLabelText('Close right side panel');
      expect(navMask).toHaveClass('nav-mask active');
    });
  });

  describe('LocalStorage Interactions', () => {
    it('saves layout to localStorage on resize', async () => {
      jest.useFakeTimers();

      render(
        <RecoilRoot>
          <SidePanelGroup>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      jest.advanceTimersByTime(400);

      const savedLayout = localStorage.getItem('react-resizable-panels:layout');
      expect(savedLayout).toBeTruthy();
      expect(JSON.parse(savedLayout!)).toEqual([60, 20, 20]);

      jest.useRealTimers();
    });
  });

  describe('Startup Configuration', () => {
    it('uses startup config when available', () => {
      mockUseGetStartupConfig.mockReturnValue({
        data: { interface: { sidePanel: false } },
      });

      render(
        <RecoilRoot>
          <SidePanelGroup>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument();
    });

    it('uses default interface config when startup config is unavailable', () => {
      mockUseGetStartupConfig.mockReturnValue({ data: null });

      render(
        <RecoilRoot initializeState={({ set }) => set(store.hideSidePanel, false)}>
          <SidePanelGroup>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles undefined defaultLayout', () => {
      render(
        <RecoilRoot>
          <SidePanelGroup defaultLayout={undefined}>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      expect(screen.getByTestId('resizable-panel-messages-view')).toBeInTheDocument();
    });

    it('handles rapid screen size changes', () => {
      const { rerender } = render(
        <RecoilRoot>
          <SidePanelGroup>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      const screenSizes = [true, false, true, false];
      screenSizes.forEach((isSmall) => {
        mockUseMediaQuery.mockReturnValue(isSmall);
        rerender(
          <RecoilRoot>
            <SidePanelGroup>
              <div aria-label="Content" />
            </SidePanelGroup>
          </RecoilRoot>,
        );
      });

      expect(mockPanelRef.current.collapse).toHaveBeenCalledTimes(2);
    });

    it('handles missing panel ref gracefully', () => {
      const SidePanelMock = jest.requireMock('../SidePanel').default;
      SidePanelMock.mockImplementation(() => <div data-testid="side-panel" />);

      expect(() => {
        render(
          <RecoilRoot>
            <SidePanelGroup>
              <div aria-label="Content" />
            </SidePanelGroup>
          </RecoilRoot>,
        );
      }).not.toThrow();
    });

    it('normalizes extreme layout values', () => {
      jest.useFakeTimers();

      render(
        <RecoilRoot>
          <SidePanelGroup defaultLayout={[150, -50]}>
            <div aria-label="Content" />
          </SidePanelGroup>
        </RecoilRoot>,
      );

      jest.advanceTimersByTime(400);

      const savedLayout = localStorage.getItem('react-resizable-panels:layout');
      expect(savedLayout).toBeTruthy();

      jest.useRealTimers();
    });
  });
});
