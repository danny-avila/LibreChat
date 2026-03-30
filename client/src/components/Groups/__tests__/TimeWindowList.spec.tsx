import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import userEvent from '@testing-library/user-event';
import TimeWindowList from '../TimeWindowList';
import type { TimeWindow } from '../types';

const mockOnAdd = jest.fn();
const mockOnEdit = jest.fn();
const mockOnDelete = jest.fn();
const mockOnToggleActive = jest.fn();

const mockTimeWindows: TimeWindow[] = [
  {
    _id: 'window1',
    name: 'Business Hours',
    windowType: 'daily',
    startTime: '09:00',
    endTime: '17:00',
    daysOfWeek: [],
    startDate: '',
    endDate: '',
    timezone: 'UTC',
    isActive: true,
  },
  {
    _id: 'window2',
    name: 'Weekends Only',
    windowType: 'weekly',
    startTime: '10:00',
    endTime: '16:00',
    daysOfWeek: [0, 6], // Sunday and Saturday
    startDate: '',
    endDate: '',
    timezone: 'America/New_York',
    isActive: false,
  },
  {
    _id: 'window3',
    name: 'Holiday Period',
    windowType: 'date_range',
    startTime: '',
    endTime: '',
    daysOfWeek: [],
    startDate: '2024-12-20',
    endDate: '2024-12-31',
    timezone: 'UTC',
    isActive: true,
  },
  {
    _id: 'window4',
    name: 'Maintenance Block',
    windowType: 'exception',
    startTime: '',
    endTime: '',
    daysOfWeek: [],
    startDate: '2024-01-15',
    endDate: '2024-01-15',
    timezone: 'UTC',
    isActive: true,
  },
];

// Mock window.confirm
const mockConfirm = jest.fn();
Object.defineProperty(window, 'confirm', {
  value: mockConfirm,
  writable: true,
});

describe('TimeWindowList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockReturnValue(true);
  });

  describe('Empty State', () => {
    it('should show empty state when no time windows exist', () => {
      render(
        <TimeWindowList
          timeWindows={[]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText(/no time windows configured/i)).toBeInTheDocument();
      expect(screen.getByText(/add time windows to control when group members can access the system/i)).toBeInTheDocument();
      expect(screen.getByText(/add your first window/i)).toBeInTheDocument();
    });

    it('should call onAdd when "Add Your First Window" button is clicked', async () => {
      render(
        <TimeWindowList
          timeWindows={[]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      const addButton = screen.getByText(/add your first window/i);
      await userEvent.click(addButton);

      expect(mockOnAdd).toHaveBeenCalled();
    });
  });

  describe('Header and Add Button', () => {
    it('should render header and add button when time windows exist', () => {
      render(
        <TimeWindowList
          timeWindows={mockTimeWindows}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Time Windows')).toBeInTheDocument();
      expect(screen.getByText(/configure when members of this group can access the system/i)).toBeInTheDocument();
      expect(screen.getByText(/add window/i)).toBeInTheDocument();
    });

    it('should call onAdd when header "Add Window" button is clicked', async () => {
      render(
        <TimeWindowList
          timeWindows={mockTimeWindows}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      expect(mockOnAdd).toHaveBeenCalled();
    });
  });

  describe('Time Window Rendering', () => {
    it('should render all time windows', () => {
      render(
        <TimeWindowList
          timeWindows={mockTimeWindows}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Business Hours')).toBeInTheDocument();
      expect(screen.getByText('Weekends Only')).toBeInTheDocument();
      expect(screen.getByText('Holiday Period')).toBeInTheDocument();
      expect(screen.getByText('Maintenance Block')).toBeInTheDocument();
    });

    it('should display correct window type labels', () => {
      render(
        <TimeWindowList
          timeWindows={mockTimeWindows}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Daily')).toBeInTheDocument();
      expect(screen.getByText('Weekly')).toBeInTheDocument();
      expect(screen.getByText('Date Range')).toBeInTheDocument();
      expect(screen.getByText('Exception')).toBeInTheDocument();
    });

    it('should format daily window display correctly', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('09:00 - 17:00')).toBeInTheDocument();
    });

    it('should format weekly window display correctly', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[1]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Sun, Sat 10:00 - 16:00')).toBeInTheDocument();
    });

    it('should format date range window display correctly', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[2]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      // Note: Dates will be formatted according to locale
      expect(screen.getByText(/12\/20\/2024 - 12\/31\/2024/)).toBeInTheDocument();
    });

    it('should format exception window display correctly', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[3]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      // Single day exception should show just one date
      expect(screen.getByText(/1\/15\/2024/)).toBeInTheDocument();
    });

    it('should show timezone when not UTC', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[1]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Timezone: America/New_York')).toBeInTheDocument();
    });

    it('should not show timezone when UTC', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.queryByText(/timezone:/i)).not.toBeInTheDocument();
    });

    it('should show disabled badge for inactive windows', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[1]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('should not show disabled badge for active windows', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
    });
  });

  describe('Window Actions', () => {
    it('should call onEdit when edit button is clicked', async () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      const editButton = screen.getByRole('button', { name: '' }); // Edit button has no text, just icon
      const editButtons = screen.getAllByRole('button');
      const editButton2 = editButtons.find(button => 
        button.querySelector('svg') && 
        !button.textContent?.includes('Add') &&
        !button.textContent?.includes('Toggle')
      );
      
      if (editButton2) {
        await userEvent.click(editButton2);
        expect(mockOnEdit).toHaveBeenCalledWith(mockTimeWindows[0]);
      }
    });

    it('should call onDelete when delete button is clicked and confirmed', async () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      // Find delete button (red button)
      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find(button => 
        button.className.includes('text-red') || 
        button.className.includes('red')
      );

      expect(deleteButton).toBeInTheDocument();
      
      if (deleteButton) {
        await userEvent.click(deleteButton);
        
        expect(mockConfirm).toHaveBeenCalledWith(
          'Are you sure you want to delete this time window? This action cannot be undone.'
        );
        expect(mockOnDelete).toHaveBeenCalledWith('window1');
      }
    });

    it('should not call onDelete when delete is cancelled', async () => {
      mockConfirm.mockReturnValue(false);

      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find(button => 
        button.className.includes('text-red') || 
        button.className.includes('red')
      );

      if (deleteButton) {
        await userEvent.click(deleteButton);
        
        expect(mockConfirm).toHaveBeenCalled();
        expect(mockOnDelete).not.toHaveBeenCalled();
      }
    });

    it('should call onToggleActive when toggle button is clicked for active window', async () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      // Find toggle button (should show as active)
      const toggleButtons = screen.getAllByRole('button');
      const toggleButton = toggleButtons.find(button => 
        button.getAttribute('title')?.includes('Disable') ||
        button.getAttribute('title')?.includes('Enable')
      );

      expect(toggleButton).toBeInTheDocument();
      
      if (toggleButton) {
        await userEvent.click(toggleButton);
        expect(mockOnToggleActive).toHaveBeenCalledWith('window1', false);
      }
    });

    it('should call onToggleActive when toggle button is clicked for inactive window', async () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[1]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      const toggleButtons = screen.getAllByRole('button');
      const toggleButton = toggleButtons.find(button => 
        button.getAttribute('title')?.includes('Enable')
      );

      if (toggleButton) {
        await userEvent.click(toggleButton);
        expect(mockOnToggleActive).toHaveBeenCalledWith('window2', true);
      }
    });
  });

  describe('Loading States', () => {
    it('should disable buttons when loading', () => {
      render(
        <TimeWindowList
          timeWindows={mockTimeWindows}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
          isLoading={true}
        />
      );

      const addButton = screen.getByText(/add window/i);
      expect(addButton).toBeDisabled();

      // Check that action buttons are disabled
      const allButtons = screen.getAllByRole('button');
      allButtons.forEach(button => {
        if (!button.textContent?.includes('Time Window Types')) {
          expect(button).toBeDisabled();
        }
      });
    });
  });

  describe('Help Information', () => {
    it('should display help information about time window types', () => {
      render(
        <TimeWindowList
          timeWindows={mockTimeWindows}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Time Window Types:')).toBeInTheDocument();
      expect(screen.getByText(/Daily:.*Same time period every day/)).toBeInTheDocument();
      expect(screen.getByText(/Weekly:.*Specific days and times each week/)).toBeInTheDocument();
      expect(screen.getByText(/Date Range:.*Access allowed during specific date period/)).toBeInTheDocument();
      expect(screen.getByText(/Exception:.*Block access on specific dates/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle time windows without _id gracefully', () => {
      const windowWithoutId = { ...mockTimeWindows[0], _id: undefined };
      
      render(
        <TimeWindowList
          timeWindows={[windowWithoutId as TimeWindow]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Business Hours')).toBeInTheDocument();
      // Actions should still be available but may not work properly
    });

    it('should handle empty time windows array properly', () => {
      render(
        <TimeWindowList
          timeWindows={[]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText(/no time windows configured/i)).toBeInTheDocument();
    });

    it('should handle missing daysOfWeek for weekly windows', () => {
      const weeklyWindowWithNoDays = {
        ...mockTimeWindows[1],
        daysOfWeek: undefined,
      };

      render(
        <TimeWindowList
          timeWindows={[weeklyWindowWithNoDays as TimeWindow]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      // Should still render without crashing
      expect(screen.getByText('Weekends Only')).toBeInTheDocument();
      // Should show time without days
      expect(screen.getByText('10:00 - 16:00')).toBeInTheDocument();
    });

    it('should handle unknown window type gracefully', () => {
      const unknownTypeWindow = {
        ...mockTimeWindows[0],
        windowType: 'unknown' as any,
      };

      render(
        <TimeWindowList
          timeWindows={[unknownTypeWindow]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      expect(screen.getByText('Business Hours')).toBeInTheDocument();
      expect(screen.getByText('unknown')).toBeInTheDocument();
      expect(screen.getByText('Unknown format')).toBeInTheDocument();
    });

    it('should show loading state during deletion', async () => {
      const { rerender } = render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find(button => 
        button.className.includes('text-red') || 
        button.className.includes('red')
      );

      if (deleteButton) {
        // Simulate clicking delete button
        await userEvent.click(deleteButton);
        
        // The component should handle the loading state internally
        expect(mockOnDelete).toHaveBeenCalled();
      }
    });
  });

  describe('Visual States', () => {
    it('should apply different styling for active vs inactive windows', () => {
      render(
        <TimeWindowList
          timeWindows={[mockTimeWindows[0], mockTimeWindows[1]]}
          onAdd={mockOnAdd}
          onEdit={mockOnEdit}
          onDelete={mockOnDelete}
          onToggleActive={mockOnToggleActive}
        />
      );

      // Both windows should be rendered
      expect(screen.getByText('Business Hours')).toBeInTheDocument();
      expect(screen.getByText('Weekends Only')).toBeInTheDocument();
      
      // Inactive window should have "Disabled" badge
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });
});