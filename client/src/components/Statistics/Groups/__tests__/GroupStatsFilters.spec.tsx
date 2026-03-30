import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import GroupStatsFilters from '../GroupStatsFilters';
import { GroupLeaderboardParams } from '../../hooks';

// Mock the UI components
jest.mock('@librechat/client', () => ({
  Button: ({ children, onClick, variant, size, className, disabled }: any) => (
    <button onClick={onClick} className={`${variant} ${size} ${className}`} disabled={disabled}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, type, min, placeholder, className }: any) => (
    <input
      value={value || ''}
      onChange={onChange}
      type={type}
      min={min}
      placeholder={placeholder}
      className={className}
    />
  ),
  Select: ({ value, onChange, className, children }: any) => (
    <select value={value} onChange={onChange} className={className}>
      {children}
    </select>
  ),
}));

describe('GroupStatsFilters', () => {
  const mockOnFilterChange = jest.fn();

  const defaultParams: GroupLeaderboardParams = {
    page: 1,
    limit: 20,
    sortBy: 'totalTokens',
    sortOrder: 'desc',
  };

  const paramsWithFilters: GroupLeaderboardParams = {
    ...defaultParams,
    dateFrom: '2024-01-01',
    dateTo: '2024-01-31',
    minMembers: 5,
    includeInactive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default state', () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('per page')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument(); // No active filters badge
  });

  it('should show active filters badge when filters are applied', () => {
    render(<GroupStatsFilters params={paramsWithFilters} onFilterChange={mockOnFilterChange} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('should toggle filter panel visibility', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    const filtersButton = screen.getByText('Filters');

    // Initially filters panel should not be visible
    expect(screen.queryByText('Date From')).not.toBeInTheDocument();

    // Click to show filters
    fireEvent.click(filtersButton);
    expect(screen.getByText('Date From')).toBeInTheDocument();
    expect(screen.getByText('Date To')).toBeInTheDocument();
    expect(screen.getByText('Minimum Members')).toBeInTheDocument();

    // Click again to hide filters
    fireEvent.click(filtersButton);
    await waitFor(() => {
      expect(screen.queryByText('Date From')).not.toBeInTheDocument();
    });
  });

  it('should handle page size changes', () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    const pageSizeSelect = screen.getByDisplayValue('20');
    fireEvent.change(pageSizeSelect, { target: { value: '50' } });

    expect(mockOnFilterChange).toHaveBeenCalledWith({ limit: 50 });
  });

  it('should handle date range input', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const dateFromInput = screen.getByLabelText(/Date From/i);
    const dateToInput = screen.getByLabelText(/Date To/i);

    fireEvent.change(dateFromInput, { target: { value: '2024-01-01' } });
    fireEvent.change(dateToInput, { target: { value: '2024-01-31' } });

    // Apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      dateFrom: '2024-01-01',
      dateTo: '2024-01-31',
      minMembers: undefined,
      includeInactive: false,
    });
  });

  it('should handle minimum members input', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const minMembersInput = screen.getByPlaceholderText('e.g., 5');
    fireEvent.change(minMembersInput, { target: { value: '10' } });

    // Apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      dateFrom: undefined,
      dateTo: undefined,
      minMembers: 10,
      includeInactive: false,
    });
  });

  it('should handle include inactive checkbox', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const includeInactiveCheckbox = screen.getByLabelText(/Include Inactive Groups/i);
    fireEvent.click(includeInactiveCheckbox);

    // Apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      dateFrom: undefined,
      dateTo: undefined,
      minMembers: undefined,
      includeInactive: true,
    });
  });

  it('should handle quick date range presets', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    // Mock current date
    const mockDate = new Date('2024-01-15');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

    // Click "Last 7 days"
    const lastWeekButton = screen.getByText('Last 7 days');
    fireEvent.click(lastWeekButton);

    // Verify local state was updated (dates should be set)
    const dateFromInput = screen.getByLabelText(/Date From/i) as HTMLInputElement;
    const dateToInput = screen.getByLabelText(/Date To/i) as HTMLInputElement;

    expect(dateFromInput.value).toBeTruthy();
    expect(dateToInput.value).toBeTruthy();

    // Apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    expect(mockOnFilterChange).toHaveBeenCalled();

    // Restore Date mock
    (global.Date as any).mockRestore();
  });

  it('should handle "Last 30 days" preset', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    // Click "Last 30 days"
    const lastMonthButton = screen.getByText('Last 30 days');
    fireEvent.click(lastMonthButton);

    const dateFromInput = screen.getByLabelText(/Date From/i) as HTMLInputElement;
    expect(dateFromInput.value).toBeTruthy();
  });

  it('should handle "This month" preset', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const thisMonthButton = screen.getByText('This month');
    fireEvent.click(thisMonthButton);

    const dateFromInput = screen.getByLabelText(/Date From/i) as HTMLInputElement;
    expect(dateFromInput.value).toBeTruthy();
  });

  it('should handle "Last month" preset', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const lastMonthButton = screen.getByText('Last month');
    fireEvent.click(lastMonthButton);

    const dateFromInput = screen.getByLabelText(/Date From/i) as HTMLInputElement;
    expect(dateFromInput.value).toBeTruthy();
  });

  it('should reset filters when clear button is clicked', async () => {
    render(<GroupStatsFilters params={paramsWithFilters} onFilterChange={mockOnFilterChange} />);

    const clearButton = screen.getByText('Clear Filters');
    fireEvent.click(clearButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      dateFrom: undefined,
      dateTo: undefined,
      minMembers: undefined,
      includeInactive: false,
    });
  });

  it('should cancel filter changes', async () => {
    render(<GroupStatsFilters params={paramsWithFilters} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    // Make some changes
    const dateFromInput = screen.getByDisplayValue('2024-01-01');
    fireEvent.change(dateFromInput, { target: { value: '2024-02-01' } });

    // Cancel changes
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Filter panel should be hidden and no changes applied
    expect(screen.queryByText('Date From')).not.toBeInTheDocument();
    expect(mockOnFilterChange).not.toHaveBeenCalled();
  });

  it('should populate initial filter values from params', () => {
    render(<GroupStatsFilters params={paramsWithFilters} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    // Check that fields are populated with existing values
    const dateFromInput = screen.getByDisplayValue('2024-01-01') as HTMLInputElement;
    const dateToInput = screen.getByDisplayValue('2024-01-31') as HTMLInputElement;
    const minMembersInput = screen.getByDisplayValue('5') as HTMLInputElement;
    const includeInactiveCheckbox = screen.getByLabelText(
      /Include Inactive Groups/i,
    ) as HTMLInputElement;

    expect(dateFromInput.value).toBe('2024-01-01');
    expect(dateToInput.value).toBe('2024-01-31');
    expect(minMembersInput.value).toBe('5');
    expect(includeInactiveCheckbox.checked).toBe(true);
  });

  it('should handle empty minimum members input', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const minMembersInput = screen.getByPlaceholderText('e.g., 5');

    // Enter a value then clear it
    fireEvent.change(minMembersInput, { target: { value: '10' } });
    fireEvent.change(minMembersInput, { target: { value: '' } });

    // Apply filters
    const applyButton = screen.getByText('Apply Filters');
    fireEvent.click(applyButton);

    expect(mockOnFilterChange).toHaveBeenCalledWith({
      dateFrom: undefined,
      dateTo: undefined,
      minMembers: undefined,
      includeInactive: false,
    });
  });

  it('should handle numeric input validation for minimum members', async () => {
    render(<GroupStatsFilters params={defaultParams} onFilterChange={mockOnFilterChange} />);

    // Show filters panel
    fireEvent.click(screen.getByText('Filters'));

    const minMembersInput = screen.getByPlaceholderText('e.g., 5');

    // Try to enter non-numeric value
    fireEvent.change(minMembersInput, { target: { value: 'abc' } });

    // Input should reject non-numeric values due to type="number"
    expect((minMembersInput as HTMLInputElement).type).toBe('number');
  });
});
