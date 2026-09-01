import '@testing-library/jest-dom/extend-expect';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import PanelContent from '../PanelContent';

describe('PanelContent', () => {
  const skeleton = <div data-testid="skeleton" aria-hidden="true" />;

  test('announces loading while the skeleton stands in for the rows', () => {
    render(
      <PanelContent isLoading={true} skeleton={skeleton}>
        <span data-testid="rows" />
      </PanelContent>,
    );

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('rows')).not.toBeInTheDocument();

    /** The skeleton is aria-hidden, so the announcement has to come from elsewhere */
    const announcement = screen.getByText('Loading...');
    expect(announcement).toHaveClass('sr-only');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
  });

  test('marks the scroll container busy only while loading', () => {
    const { container, rerender } = render(<PanelContent isLoading={true} skeleton={skeleton} />);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');

    rerender(<PanelContent isLoading={false} skeleton={skeleton} />);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
  });

  test('renders children once loaded', () => {
    render(
      <PanelContent isLoading={false} skeleton={skeleton}>
        <span data-testid="rows" />
      </PanelContent>,
    );

    expect(screen.getByTestId('rows')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  test('renders the empty state instead of children when the list is empty', () => {
    render(
      <PanelContent
        isLoading={false}
        isEmpty={true}
        skeleton={skeleton}
        empty={<span data-testid="empty" />}
      >
        <span data-testid="rows" />
      </PanelContent>,
    );

    expect(screen.getByTestId('empty')).toBeInTheDocument();
    expect(screen.queryByTestId('rows')).not.toBeInTheDocument();
  });

  test('falls back to children when empty but given no empty state', () => {
    render(
      <PanelContent isLoading={false} isEmpty={true} skeleton={skeleton}>
        <span data-testid="rows" />
      </PanelContent>,
    );

    expect(screen.getByTestId('rows')).toBeInTheDocument();
  });

  test('forwards its ref to the scroll container so panels can fetch on scroll', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <PanelContent ref={ref} isLoading={false} skeleton={skeleton} className="px-4" />,
    );

    expect(ref.current).toBe(container.firstChild);
    expect(ref.current).toHaveClass('overflow-y-auto', 'px-4');
  });
});
