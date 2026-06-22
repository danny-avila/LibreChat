import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UIResource } from 'librechat-data-provider';
import UIResourceCarousel from '~/components/Chat/Messages/Content/UIResourceCarousel';

jest.mock('~/hooks/MCP', () => ({
  useMCPAppCallbacks: () => ({
    onCallTool: jest.fn(),
    onReadResource: jest.fn(),
    onOpenLink: jest.fn(),
  }),
}));

jest.mock('@mcp-ui/client', () => ({
  AppRenderer: ({ toolResourceUri }: { toolResourceUri: string }) => (
    <div data-testid="ui-resource-renderer" data-uri={toolResourceUri} />
  ),
}));

jest.mock('~/utils/mcpApps', () => ({
  getMCPSandboxConfig: () => ({ url: new URL('http://localhost/sandbox') }),
  callMCPAppTool: jest.fn(),
  readMCPResource: jest.fn(),
}));

jest.mock('~/utils', () => ({
  logger: { error: jest.fn() },
}));

const mockScrollTo = jest.fn();
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: mockScrollTo,
});

const makeResource = (n: number): UIResource => ({
  uri: `resource${n}`,
  mimeType: 'text/html',
  text: `Resource ${n}`,
  resourceId: `r${n}`,
  toolName: 'test-tool',
  serverName: 'test-server',
});

describe('UIResourceCarousel', () => {
  const mockUIResources: UIResource[] = [1, 2, 3, 4, 5].map(makeResource);

  beforeEach(() => {
    jest.clearAllMocks();
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
    render(<UIResourceCarousel uiResources={mockUIResources} />);
    expect(screen.getAllByTestId('ui-resource-renderer')).toHaveLength(5);
  });

  it('renders AppRenderer with correct uri for each resource', () => {
    render(<UIResourceCarousel uiResources={mockUIResources.slice(0, 2)} />);
    const renderers = screen.getAllByTestId('ui-resource-renderer');
    expect(renderers[0]).toHaveAttribute('data-uri', 'resource1');
    expect(renderers[1]).toHaveAttribute('data-uri', 'resource2');
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
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
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
    render(<UIResourceCarousel uiResources={mockUIResources.slice(0, 2)} />);
    const renderers = screen.getAllByTestId('ui-resource-renderer');
    renderers.forEach((el, index) => {
      const card = el.parentElement?.parentElement;
      expect(card).toHaveStyle({
        width: '230px',
        minHeight: '360px',
        animationDelay: `${index * 100}ms`,
      });
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
