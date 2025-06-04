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

  it('renders memory values and pagination', () => {
    const memories = Array.from({ length: 12 }).map((_, i) => ({
      key: `key${i}`,
      value: `value${i}`,
      updated_at: new Date().toISOString(),
    }));
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });
    render(<MemoryViewer />);

    // should show first 10 memory values (keys are hidden)
    expect(screen.getByText('value0')).toBeInTheDocument();
    expect(screen.getByText('value9')).toBeInTheDocument();
    expect(screen.queryByText('value10')).not.toBeInTheDocument();

    // keys should not be displayed
    expect(screen.queryByText('key0')).not.toBeInTheDocument();
    expect(screen.queryByText('key9')).not.toBeInTheDocument();

    // click next
    fireEvent.click(screen.getByText(/next/i));
    expect(screen.getByText('value10')).toBeInTheDocument();
  });

  it('shows Memory column header instead of Key and Value', () => {
    const memories = [{ key: 'key1', value: 'value1', updated_at: new Date().toISOString() }];
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });

    render(<MemoryViewer />);

    // Should show "Memory" header, not "Key" or "Value"
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.queryByText('Key')).not.toBeInTheDocument();
    expect(screen.queryByText('Value')).not.toBeInTheDocument();
  });

  it('triggers edit flow and calls update mutation with key and value changes', () => {
    const memories = [{ key: 'key1', value: 'value1', updated_at: new Date().toISOString() }];
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });

    render(<MemoryViewer />);

    // Click edit (pencil) button
    fireEvent.click(screen.getByLabelText(/edit/i));

    // The edit dialog should open - find inputs for editing both key and value
    const keyInput = screen.getByLabelText(/key/i);
    const valueTextarea = screen.getByLabelText(/value/i);

    // Change both key and value
    fireEvent.change(keyInput, { target: { value: 'new_key' } });
    fireEvent.change(valueTextarea, { target: { value: 'new value' } });

    // Find and click the save button
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    // Should call update with the new key, new value, and original key
    expect(mockUseUpdateMemoryMutation).toHaveBeenCalledWith(
      { key: 'new_key', value: 'new value', originalKey: 'key1' },
      expect.any(Object),
    );
  });

  it('triggers delete flow and calls delete mutation', () => {
    const memories = [{ key: 'key2', value: 'value2', updated_at: new Date().toISOString() }];
    mockUseMemoriesQuery.mockReturnValueOnce({ isLoading: false, data: memories });

    render(<MemoryViewer />);

    // Click delete (trash) button
    fireEvent.click(screen.getByLabelText(/delete/i));

    // Click confirm delete in the modal
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    expect(mockUseDeleteMemoryMutation).toHaveBeenCalledWith('key2', expect.any(Object));
  });
});
