import React from 'react';
import { act, render, screen } from '@testing-library/react';
import SidePanelGroup from './SidePanelGroup';
import { ONECODE_CONSOLE_OPEN_EVENT } from '~/onecode/console';

jest.mock('@librechat/client', () => ({
  ResizableHandleAlt: ({ children }) => <div data-testid="resize-handle">{children}</div>,
  ResizablePanel: ({ children }) => <div>{children}</div>,
  ResizablePanelGroup: ({ children }) => <div>{children}</div>,
  useMediaQuery: () => false,
}));

jest.mock('react-resizable-panels', () => ({
  useDefaultLayout: () => ({ defaultLayout: undefined, onLayoutChanged: jest.fn() }),
  usePanelRef: () => ({ current: { expand: jest.fn() } }),
}));

jest.mock('~/components/OneCode/OneCodeConsolePanel', () => ({
  __esModule: true,
  default: ({ initialTab, onClose }) => (
    <section>
      OneCode Console
      <span>tab:{initialTab}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </section>
  ),
}));

describe('SidePanelGroup OneCode console integration', () => {
  it('opens OneCode console when the global event is dispatched', () => {
    render(
      <SidePanelGroup>
        <main>chat</main>
      </SidePanelGroup>,
    );

    expect(screen.queryByText('OneCode Console')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent(ONECODE_CONSOLE_OPEN_EVENT));
    });

    expect(screen.getByText('OneCode Console')).toBeInTheDocument();
    expect(screen.getByText('tab:project')).toBeInTheDocument();
  });

  it('opens OneCode console at the requested model tab', () => {
    render(
      <SidePanelGroup>
        <main>chat</main>
      </SidePanelGroup>,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent(ONECODE_CONSOLE_OPEN_EVENT, { detail: { tab: 'model' } }),
      );
    });

    expect(screen.getByText('OneCode Console')).toBeInTheDocument();
    expect(screen.getByText('tab:model')).toBeInTheDocument();
  });
});
