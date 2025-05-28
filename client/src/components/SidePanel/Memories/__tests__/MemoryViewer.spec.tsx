import React from 'react';
import { render, screen, fireEvent } from 'test/layout-test-utils';
import MemoryViewer from '../MemoryViewer';

// Mock data-provider hooks
const mockUseMemoriesQuery = jest.fn();
const mockUseDeleteMemoryMutation = jest.fn();
const mockUseUpdateMemoryMutation = jest.fn();

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useMemoriesQuery: () => mockUseMemoriesQuery(),
  useDeleteMemoryMutation: () => ({ mutate: mockUseDeleteMemoryMutation }),
  useUpdateMemoryMutation: () => ({ mutate: mockUseUpdateMemoryMutation }),
}));

jest.mock('~/Providers', () => {
  const actual = jest.requireActual('~/Providers');
  return {
    ...actual,
    useToastContext: () => ({ showToast: jest.fn() }),
  };
});

describe('MemoryViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Spinner during loading', () => {
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: true, data: [] });
    render(<MemoryViewer />);
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
  });

  it('renders rows and pagination', () => {
    const memories = Array.from({ length: 12 }).map((_, i) => ({
      key: `key${i}`,
      value: `value${i}`,
      updated_at: new Date().toISOString(),
    }));
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });
    render(<MemoryViewer />);

    // should show first 10 rows
    expect(screen.getByText('key0')).toBeInTheDocument();
    expect(screen.getByText('key9')).toBeInTheDocument();
    expect(screen.queryByText('key10')).not.toBeInTheDocument();

    // click next
    fireEvent.click(screen.getByText(/next/i));
    expect(screen.getByText('key10')).toBeInTheDocument();
  });

  it('triggers edit flow and calls update mutation', () => {
    const memories = [{ key: 'key1', value: 'value1', updated_at: new Date().toISOString() }];
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });

    render(<MemoryViewer />);

    // Click edit (pencil) button
    fireEvent.click(screen.getByLabelText(/edit/i));

    // Type new value
    const input = screen.getByLabelText(/edit/i);
    fireEvent.change(input, { target: { value: 'new value' } });

    // Press Enter to save
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(mockUseUpdateMemoryMutation).toHaveBeenCalledWith(
      { key: 'key1', value: 'new value' },
      expect.any(Object),
    );
  });

  it('triggers delete flow and calls delete mutation', () => {
    const memories = [{ key: 'key2', value: 'value2', updated_at: new Date().toISOString() }];
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });

    // Mock window.confirm to always return true
    jest.spyOn(window, 'confirm').mockImplementation(() => true);

    render(<MemoryViewer />);

    // Click delete (trash) button
    fireEvent.click(screen.getByLabelText(/delete/i));

    expect(mockUseDeleteMemoryMutation).toHaveBeenCalledWith('key2', expect.any(Object));
  });
});
