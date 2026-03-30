import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import userEvent from '@testing-library/user-event';
import TimeWindowManager from '../TimeWindowManager';
import * as hooks from '../hooks';
import type { TimeWindow, CreateTimeWindowRequest, UpdateTimeWindowRequest } from '../types';

// Mock the hooks
jest.mock('../hooks', () => ({
  useAddTimeWindowMutation: jest.fn(),
  useUpdateTimeWindowMutation: jest.fn(),
  useRemoveTimeWindowMutation: jest.fn(),
}));

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
    name: 'Weekend Hours',
    windowType: 'weekly',
    startTime: '10:00',
    endTime: '16:00',
    daysOfWeek: [0, 6],
    startDate: '',
    endDate: '',
    timezone: 'UTC',
    isActive: false,
  },
];

const mockOnRefresh = jest.fn();

// Mock mutation objects
const mockAddMutation = {
  isPending: false,
  mutateAsync: jest.fn(),
};

const mockUpdateMutation = {
  isPending: false,
  mutateAsync: jest.fn(),
};

const mockRemoveMutation = {
  isPending: false,
  mutateAsync: jest.fn(),
};

describe('TimeWindowManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    (hooks.useAddTimeWindowMutation as jest.Mock).mockReturnValue(mockAddMutation);
    (hooks.useUpdateTimeWindowMutation as jest.Mock).mockReturnValue(mockUpdateMutation);
    (hooks.useRemoveTimeWindowMutation as jest.Mock).mockReturnValue(mockRemoveMutation);
  });

  describe('Initial Rendering', () => {
    it('should render TimeWindowList by default', () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      expect(screen.getByText('Time Windows')).toBeInTheDocument();
      expect(screen.getByText('Business Hours')).toBeInTheDocument();
      expect(screen.getByText('Weekend Hours')).toBeInTheDocument();
    });

    it('should show empty state when no time windows exist', () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={[]}
          onRefresh={mockOnRefresh}
        />
      );

      expect(screen.getByText(/no time windows configured/i)).toBeInTheDocument();
    });
  });

  describe('Add Time Window Flow', () => {
    it('should show form when add button is clicked', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      expect(screen.getByText('Add Time Window')).toBeInTheDocument();
      expect(screen.getByText(/configure when group members can access the system/i)).toBeInTheDocument();
    });

    it('should hide list and show form when in add mode', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      // List should be hidden
      expect(screen.queryByText('Business Hours')).not.toBeInTheDocument();
      expect(screen.queryByText('Weekend Hours')).not.toBeInTheDocument();
      
      // Form should be shown
      expect(screen.getByLabelText(/time window name/i)).toBeInTheDocument();
    });

    it('should create new time window successfully', async () => {
      mockAddMutation.mutateAsync.mockResolvedValue({});

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open form
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      // Fill form
      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'New Window');

      // Submit form
      const createButton = screen.getByText(/create window/i);
      await userEvent.click(createButton);

      expect(mockAddMutation.mutateAsync).toHaveBeenCalledWith({
        groupId: 'group123',
        data: expect.objectContaining({
          name: 'New Window',
          windowType: 'daily',
        }),
      });

      await waitFor(() => {
        expect(mockOnRefresh).toHaveBeenCalled();
      });
    });

    it('should handle add errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Failed to create time window');
      mockAddMutation.mutateAsync.mockRejectedValue(error);

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open form and submit
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'New Window');

      const createButton = screen.getByText(/create window/i);
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Error saving time window:', error);
      });

      consoleError.mockRestore();
    });
  });

  describe('Edit Time Window Flow', () => {
    it('should show form when edit button is clicked', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Find and click edit button (looking for buttons that aren't the add button)
      const allButtons = screen.getAllByRole('button');
      const editButton = allButtons.find(button => 
        !button.textContent?.includes('Add') && 
        !button.textContent?.includes('Toggle') &&
        button.querySelector('svg') // Edit button should have an icon
      );

      expect(editButton).toBeInTheDocument();
      
      if (editButton) {
        await userEvent.click(editButton);

        expect(screen.getByText('Edit Time Window')).toBeInTheDocument();
        expect(screen.getByText(/modify the time window settings/i)).toBeInTheDocument();
      }
    });

    it('should pre-populate form with existing data when editing', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Simulate clicking edit (we'll manually trigger the edit function)
      const allButtons = screen.getAllByRole('button');
      const editButton = allButtons.find(button => 
        !button.textContent?.includes('Add') && 
        !button.textContent?.includes('Toggle') &&
        button.querySelector('svg')
      );

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          const nameInput = screen.getByLabelText(/time window name/i);
          expect(nameInput).toHaveValue('Business Hours');
        });
      }
    });

    it('should update existing time window successfully', async () => {
      mockUpdateMutation.mutateAsync.mockResolvedValue({});

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open edit form (simulate edit click)
      const allButtons = screen.getAllByRole('button');
      const editButton = allButtons.find(button => 
        !button.textContent?.includes('Add') && 
        !button.textContent?.includes('Toggle') &&
        button.querySelector('svg')
      );

      if (editButton) {
        await userEvent.click(editButton);

        await waitFor(() => {
          expect(screen.getByLabelText(/time window name/i)).toHaveValue('Business Hours');
        });

        // Modify the name
        const nameInput = screen.getByLabelText(/time window name/i);
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, 'Updated Business Hours');

        // Submit update
        const updateButton = screen.getByText(/update window/i);
        await userEvent.click(updateButton);

        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
          groupId: 'group123',
          windowId: 'window1',
          data: expect.objectContaining({
            name: 'Updated Business Hours',
          }),
        });

        await waitFor(() => {
          expect(mockOnRefresh).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Delete Time Window Flow', () => {
    beforeEach(() => {
      // Mock window.confirm to return true
      Object.defineProperty(window, 'confirm', {
        value: jest.fn(() => true),
        writable: true,
      });
    });

    it('should delete time window successfully', async () => {
      mockRemoveMutation.mutateAsync.mockResolvedValue({});

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Find delete button (red button)
      const allButtons = screen.getAllByRole('button');
      const deleteButton = allButtons.find(button => 
        button.className.includes('text-red') || 
        button.className.includes('red')
      );

      expect(deleteButton).toBeInTheDocument();

      if (deleteButton) {
        await userEvent.click(deleteButton);

        expect(mockRemoveMutation.mutateAsync).toHaveBeenCalledWith({
          groupId: 'group123',
          windowId: 'window1',
        });

        await waitFor(() => {
          expect(mockOnRefresh).toHaveBeenCalled();
        });
      }
    });

    it('should handle delete errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Failed to delete time window');
      mockRemoveMutation.mutateAsync.mockRejectedValue(error);

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      const allButtons = screen.getAllByRole('button');
      const deleteButton = allButtons.find(button => 
        button.className.includes('text-red') || 
        button.className.includes('red')
      );

      if (deleteButton) {
        await userEvent.click(deleteButton);

        await waitFor(() => {
          expect(consoleError).toHaveBeenCalledWith('Error deleting time window:', error);
        });
      }

      consoleError.mockRestore();
    });
  });

  describe('Toggle Active State', () => {
    it('should toggle time window active state successfully', async () => {
      mockUpdateMutation.mutateAsync.mockResolvedValue({});

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Find toggle button
      const allButtons = screen.getAllByRole('button');
      const toggleButton = allButtons.find(button => 
        button.getAttribute('title')?.includes('Disable') ||
        button.getAttribute('title')?.includes('Enable')
      );

      if (toggleButton) {
        await userEvent.click(toggleButton);

        expect(mockUpdateMutation.mutateAsync).toHaveBeenCalledWith({
          groupId: 'group123',
          windowId: 'window1',
          data: { isActive: false },
        });

        await waitFor(() => {
          expect(mockOnRefresh).toHaveBeenCalled();
        });
      }
    });

    it('should handle toggle errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Failed to toggle time window');
      mockUpdateMutation.mutateAsync.mockRejectedValue(error);

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      const allButtons = screen.getAllByRole('button');
      const toggleButton = allButtons.find(button => 
        button.getAttribute('title')?.includes('Disable') ||
        button.getAttribute('title')?.includes('Enable')
      );

      if (toggleButton) {
        await userEvent.click(toggleButton);

        await waitFor(() => {
          expect(consoleError).toHaveBeenCalledWith('Error toggling time window:', error);
        });
      }

      consoleError.mockRestore();
    });
  });

  describe('Form Navigation', () => {
    it('should return to list when cancel is clicked', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open form
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      expect(screen.getByText('Add Time Window')).toBeInTheDocument();

      // Cancel and return to list
      const cancelButton = screen.getByText(/cancel/i);
      await userEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText('Time Windows')).toBeInTheDocument();
        expect(screen.getByText('Business Hours')).toBeInTheDocument();
      });
    });

    it('should return to list when X button is clicked', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open form
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      expect(screen.getByText('Add Time Window')).toBeInTheDocument();

      // Find and click X button (close button in header)
      const closeButton = screen.getAllByRole('button').find(button => 
        button.querySelector('svg') && 
        !button.textContent?.includes('Create') &&
        !button.textContent?.includes('Cancel')
      );

      if (closeButton) {
        await userEvent.click(closeButton);

        await waitFor(() => {
          expect(screen.getByText('Time Windows')).toBeInTheDocument();
          expect(screen.getByText('Business Hours')).toBeInTheDocument();
        });
      }
    });

    it('should return to list after successful save', async () => {
      mockAddMutation.mutateAsync.mockResolvedValue({});

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open form
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      // Fill and submit form
      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'New Window');

      const createButton = screen.getByText(/create window/i);
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Time Windows')).toBeInTheDocument();
        expect(screen.getByText('Business Hours')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state when mutations are pending', () => {
      mockAddMutation.isPending = true;

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Buttons should be disabled when loading
      const addButton = screen.getByText(/add window/i);
      expect(addButton).toBeDisabled();
    });

    it('should show loading state in form when saving', async () => {
      mockAddMutation.isPending = true;

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Open form
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      // Form should show loading state
      expect(screen.getByLabelText(/time window name/i)).toBeDisabled();
      expect(screen.getByText(/saving.../i)).toBeInTheDocument();
    });
  });

  describe('Props Handling', () => {
    it('should work without onRefresh callback', async () => {
      mockAddMutation.mutateAsync.mockResolvedValue({});

      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
        />
      );

      // Should render without errors
      expect(screen.getByText('Time Windows')).toBeInTheDocument();

      // Should still allow operations (just won't call refresh)
      const addButton = screen.getByText(/add window/i);
      await userEvent.click(addButton);

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      const createButton = screen.getByText(/create window/i);
      await userEvent.click(createButton);

      expect(mockAddMutation.mutateAsync).toHaveBeenCalled();
    });

    it('should handle empty time windows array', () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={[]}
          onRefresh={mockOnRefresh}
        />
      );

      expect(screen.getByText(/no time windows configured/i)).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    it('should clear editing state when switching between add and edit', async () => {
      render(
        <TimeWindowManager
          groupId="group123"
          timeWindows={mockTimeWindows}
          onRefresh={mockOnRefresh}
        />
      );

      // Start with edit
      const allButtons = screen.getAllByRole('button');
      const editButton = allButtons.find(button => 
        !button.textContent?.includes('Add') && 
        !button.textContent?.includes('Toggle') &&
        button.querySelector('svg')
      );

      if (editButton) {
        await userEvent.click(editButton);
        expect(screen.getByText('Edit Time Window')).toBeInTheDocument();

        // Cancel and then add
        const cancelButton = screen.getByText(/cancel/i);
        await userEvent.click(cancelButton);

        const addButton = screen.getByText(/add window/i);
        await userEvent.click(addButton);

        expect(screen.getByText('Add Time Window')).toBeInTheDocument();
        // Name should be empty for new window
        const nameInput = screen.getByLabelText(/time window name/i);
        expect(nameInput).toHaveValue('');
      }
    });
  });
});