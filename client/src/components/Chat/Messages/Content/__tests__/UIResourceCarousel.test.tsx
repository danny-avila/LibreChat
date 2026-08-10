import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UIResource } from 'librechat-data-provider';
import UIResourceCarousel from '~/components/Chat/Messages/Content/UIResourceCarousel';
import { useIsMessagesViewReadOnly } from '~/Providers';
import { useAppBridge } from '~/hooks/MCP';

jest.mock('~/hooks/MCP', () => ({
  useAppBridge: jest.fn(),
  useMCPAppFrame: jest.requireActual('~/hooks/MCP/useMCPAppFrame').useMCPAppFrame,
}));

jest.mock('~/Providers', () => ({
  useIsMessagesViewReadOnly: jest.fn(() => false),
}));

jest.mock('~/utils/mcpApps', () => ({
  getInlineResourceHtml: (r: any) =>
    r?.text ||
    (typeof r?.blob === 'string' && r.blob
      ? Buffer.from(r.blob, 'base64').toString('utf-8')
      : undefined),
  isMcpAppResource: (r) =>
    !!(r && r.toolName && r.serverName) &&
    jest.requireActual('librechat-data-provider').isMcpAppMimeType(r.mimeType),
  buildAppToolResult: jest.fn(),
  getMCPSandboxUrl: () => 'http://localhost/sandbox',
  getResourceKey: (r: UIResource) => r.resourceId || r.uri,
  clampAppViewHeight: (height?: number, bounds?: { min?: number; max?: number }) =>
    typeof height === 'number' && Number.isFinite(height) && height > 0
      ? Math.min(Math.max(Math.round(height), bounds?.min ?? 80), bounds?.max ?? 4000)
      : undefined,
  MAX_CAROUSEL_VIEW_HEIGHT: 720,
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
  fetchMCPResourceHtml: jest.fn(),
}));

type BridgeParams = {
  resource: UIResource;
  onSizeChanged: (params: { height?: number }) => void;
  onTeardown?: () => void;
  active?: boolean;
};

const bridgeCalls: BridgeParams[] = [];
const bridgeFor = (resourceId: string) =>
  bridgeCalls.filter((call) => call.resource.resourceId === resourceId).at(-1) as BridgeParams;

const mockScrollTo = jest.fn();
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: mockScrollTo,
});

const makeResource = (n: number): UIResource => ({
  uri: `resource${n}`,
  mimeType: 'text/html;profile=mcp-app',
  resourceId: `r${n}`,
  toolName: 'test-tool',
  serverName: 'test-server',
});

describe('UIResourceCarousel', () => {
  const mockUIResources: UIResource[] = [1, 2, 3, 4, 5].map(makeResource);

  beforeEach(() => {
    jest.clearAllMocks();
    bridgeCalls.length = 0;
    (useAppBridge as jest.Mock).mockImplementation((params: BridgeParams) => {
      bridgeCalls.push(params);
    });
    (useIsMessagesViewReadOnly as jest.Mock).mockReturnValue(false);
    Object.defineProperty(HTMLElement.prototype, 'scrollLeft', { configurable: true, value: 0 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 500 });
  });

  it('renders nothing when no resources provided', () => {
    const { container } = render(<UIResourceCarousel uiResources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all UI resources', () => {
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources} />);
    expect(container.querySelectorAll('iframe[data-sandbox-url]')).toHaveLength(5);
  });

  it('renders bridge iframe for each bound resource', () => {
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources.slice(0, 2)} />);
    const iframes = container.querySelectorAll('iframe[data-sandbox-url]');
    expect(iframes).toHaveLength(2);
    iframes.forEach((iframe) => {
      expect(iframe).toHaveAttribute('data-sandbox-url', 'http://localhost/sandbox');
    });
  });

  it('renders a placeholder instead of bridge iframes in read-only (shared) views', () => {
    (useIsMessagesViewReadOnly as jest.Mock).mockReturnValue(true);
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources} />);
    expect(container.querySelectorAll('iframe[data-sandbox-url]')).toHaveLength(0);
    expect(screen.getAllByText(/aren't viewable in shared conversations/i).length).toBeGreaterThan(
      0,
    );
  });

  it('falls back to iframe for inline resources without toolName', () => {
    const inlineResource: UIResource = {
      uri: 'inline://1',
      mimeType: 'text/html',
      text: '<p>Hello</p>',
      resourceId: 'inline-r1',
    };
    render(<UIResourceCarousel uiResources={[inlineResource]} />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    // Non-app inline HTML renders inert (no allow-scripts); scripts run only via the sandbox proxy.
    expect(iframe?.getAttribute('sandbox')).toBe('');
  });

  it('inline iframe does not have allow-same-origin', () => {
    const inlineResource: UIResource = {
      uri: 'inline://1',
      mimeType: 'text/html',
      text: '<p>Hello</p>',
      resourceId: 'inline-r1',
    };
    render(<UIResourceCarousel uiResources={[inlineResource]} />);
    const iframe = document.querySelector('iframe');
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('shows/hides navigation arrows on hover', async () => {
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources} />);
    const carouselContainer = container.querySelector('.relative.mb-4.pt-3');
    const rightArrow = screen.getByLabelText('Scroll right');

    expect(rightArrow).toHaveClass('opacity-0');
    fireEvent.mouseEnter(carouselContainer!);
    await waitFor(() => expect(rightArrow).toHaveClass('opacity-100'));
    fireEvent.mouseLeave(carouselContainer!);
    await waitFor(() => expect(rightArrow).toHaveClass('opacity-0'));
  });

  it('handles scroll navigation', async () => {
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources} />);
    const scrollContainer = container.querySelector('.hide-scrollbar');

    Object.defineProperty(scrollContainer, 'scrollLeft', { configurable: true, value: 200 });
    fireEvent.scroll(scrollContainer!);

    await waitFor(() => expect(screen.getByLabelText('Scroll left')).toBeInTheDocument());

    const carouselContainer = container.querySelector('.relative.mb-4.pt-3');
    fireEvent.mouseEnter(carouselContainer!);

    fireEvent.click(screen.getByLabelText('Scroll right'));
    expect(mockScrollTo).toHaveBeenCalledWith({ left: 650, behavior: 'smooth' });

    fireEvent.click(screen.getByLabelText('Scroll left'));
    expect(mockScrollTo).toHaveBeenCalledWith({ left: -250, behavior: 'smooth' });
  });

  it('hides right arrow when scrolled to end', async () => {
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources} />);
    const scrollContainer = container.querySelector('.hide-scrollbar');

    Object.defineProperty(scrollContainer, 'scrollLeft', { configurable: true, value: 490 });
    fireEvent.scroll(scrollContainer!);

    await waitFor(() => {
      expect(screen.getByLabelText('Scroll left')).toBeInTheDocument();
      expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
    });
  });

  it('applies correct dimensions to resource containers', () => {
    const { container } = render(<UIResourceCarousel uiResources={mockUIResources.slice(0, 2)} />);
    const iframes = container.querySelectorAll('iframe[data-sandbox-url]');
    iframes.forEach((iframe) => {
      const card = iframe.parentElement?.parentElement;
      expect(card).toHaveStyle({
        width: '230px',
        height: '360px',
      });
    });
  });

  describe('teardown', () => {
    const cardFor = (container: HTMLElement, index: number) =>
      container.querySelectorAll('.hide-scrollbar > div')[index] as HTMLElement;

    it('drops a torn-down card from the layout and leaves its neighbours intact', () => {
      const [a, b, c] = [1, 2, 3].map(makeResource);
      const { container } = render(<UIResourceCarousel uiResources={[a, b, c]} />);

      act(() => {
        bridgeFor('r1').onSizeChanged({ height: 400 });
        bridgeFor('r2').onSizeChanged({ height: 500 });
        bridgeFor('r3').onSizeChanged({ height: 600 });
      });
      expect(container.querySelectorAll('.hide-scrollbar > div')).toHaveLength(3);

      act(() => bridgeFor('r2').onTeardown?.());

      const cards = container.querySelectorAll('.hide-scrollbar > div');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveStyle({ height: '400px' });
      expect(cards[1]).toHaveStyle({ height: '600px' });
      expect(cards[1].querySelector('iframe[data-sandbox-url]')).toBeInTheDocument();
    });

    it('does not hand a removed resource state to the resource that survives it', () => {
      const [a, b] = [1, 2].map(makeResource);
      const { container, rerender } = render(<UIResourceCarousel uiResources={[a, b]} />);

      act(() => {
        bridgeFor('r1').onSizeChanged({ height: 700 });
        bridgeFor('r2').onSizeChanged({ height: 420 });
      });

      rerender(<UIResourceCarousel uiResources={[b]} />);

      const cards = container.querySelectorAll('.hide-scrollbar > div');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveStyle({ height: '420px' });
    });

    it('clamps a slide to the carousel maximum and never below the default', () => {
      const { container } = render(<UIResourceCarousel uiResources={[makeResource(1)]} />);
      act(() => bridgeFor('r1').onSizeChanged({ height: 700 }));
      expect(cardFor(container, 0)).toHaveStyle({ height: '700px', overflow: 'hidden' });
      act(() => bridgeFor('r1').onSizeChanged({ height: 10_000 }));
      expect(cardFor(container, 0)).toHaveStyle({ height: '720px', minHeight: '360px' });
    });

    it('renders nothing once every card is torn down', () => {
      const { container } = render(<UIResourceCarousel uiResources={[makeResource(1)]} />);
      act(() => bridgeFor('r1').onTeardown?.());
      expect(container.firstChild).toBeNull();
    });

    it('recomputes the arrows when the visible set changes', async () => {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        value: 1000,
      });
      const { container } = render(<UIResourceCarousel uiResources={[1, 2].map(makeResource)} />);
      expect(screen.getByLabelText('Scroll right')).toBeInTheDocument();

      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        value: 500,
      });
      act(() => bridgeFor('r2').onTeardown?.());

      await waitFor(() => expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument());
      expect(container.querySelectorAll('.hide-scrollbar > div')).toHaveLength(1);
    });
  });

  it('cleans up event listeners on unmount', () => {
    const { container, unmount } = render(<UIResourceCarousel uiResources={mockUIResources} />);
    const scrollContainer = container.querySelector('.hide-scrollbar');
    const spy = jest.spyOn(scrollContainer!, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
