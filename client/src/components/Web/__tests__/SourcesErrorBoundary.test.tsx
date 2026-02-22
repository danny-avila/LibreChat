import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourcesErrorBoundary from '../SourcesErrorBoundary';

// Component that throws an error for testing
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div data-testid="normal-component">{'Normal component'}</div>;
};

// Mock window.location.reload
const mockReload = jest.fn();
Object.defineProperty(window, 'location', {
  value: {
    reload: mockReload,
  },
  writable: true,
});

describe('SourcesErrorBoundary - NEW COMPONENT test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress error console logs during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render children when there is no error', () => {
    render(
      <SourcesErrorBoundary>
        <ThrowError shouldThrow={false} />
      </SourcesErrorBoundary>,
    );

    expect(screen.getByTestId('normal-component')).toBeInTheDocument();
  });

  it('should render default error UI when error occurs', () => {
    render(
      <SourcesErrorBoundary>
        <ThrowError shouldThrow={true} />
      </SourcesErrorBoundary>,
    );

    expect(screen.getByText('Sources temporarily unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
  });

  it('should reload page when refresh button is clicked', () => {
    render(
      <SourcesErrorBoundary>
        <ThrowError shouldThrow={true} />
      </SourcesErrorBoundary>,
    );

    const refreshButton = screen.getByRole('button', { name: 'Reload the page' });
    fireEvent.click(refreshButton);

    expect(mockReload).toHaveBeenCalled();
  });
});
