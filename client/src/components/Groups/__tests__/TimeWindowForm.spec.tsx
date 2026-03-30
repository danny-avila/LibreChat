import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import userEvent from '@testing-library/user-event';
import TimeWindowForm from '../TimeWindowForm';
import type { TimeWindow } from '../types';

const mockOnSave = jest.fn();
const mockOnCancel = jest.fn();

const mockTimeWindow: TimeWindow = {
  _id: 'window123',
  name: 'Business Hours',
  windowType: 'daily',
  startTime: '09:00',
  endTime: '17:00',
  daysOfWeek: [],
  startDate: '',
  endDate: '',
  timezone: 'UTC',
  isActive: true,
};

describe('TimeWindowForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('should render create form with default values', () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/time window name/i)).toHaveValue('');
      expect(screen.getByTestId('window-type-select')).toBeInTheDocument();
      expect(screen.getByDisplayValue('09:00')).toBeInTheDocument(); // Default start time
      expect(screen.getByDisplayValue('17:00')).toBeInTheDocument(); // Default end time
      expect(screen.getByText(/create window/i)).toBeInTheDocument();
    });

    it('should render edit form with existing time window data', () => {
      render(
        <TimeWindowForm
          timeWindow={mockTimeWindow}
          isEditing={true}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/time window name/i)).toHaveValue('Business Hours');
      expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
      expect(screen.getByDisplayValue('17:00')).toBeInTheDocument();
      expect(screen.getByText(/update window/i)).toBeInTheDocument();
    });

    it('should render time fields for daily window type', () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
    });

    it('should render days of week for weekly window type', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      // Change to weekly window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/weekly - specific days of the week/i));

      await waitFor(() => {
        expect(screen.getByText(/days of week/i)).toBeInTheDocument();
        expect(screen.getByText('Mon')).toBeInTheDocument();
        expect(screen.getByText('Tue')).toBeInTheDocument();
        expect(screen.getByText('Wed')).toBeInTheDocument();
        expect(screen.getByText('Thu')).toBeInTheDocument();
        expect(screen.getByText('Fri')).toBeInTheDocument();
        expect(screen.getByText('Sat')).toBeInTheDocument();
        expect(screen.getByText('Sun')).toBeInTheDocument();
      });
    });

    it('should render date fields for date range window type', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      // Change to date range window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/date range - specific date period/i));

      await waitFor(() => {
        expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
      });
    });

    it('should render timezone selector', () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByTestId('timezone-select')).toBeInTheDocument();
    });

    it('should render active toggle', () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText(/window active/i)).toBeInTheDocument();
      expect(screen.getByText(/this time window is active/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when name is empty', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/time window name is required/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when name is too long', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      const longName = 'a'.repeat(101); // 101 characters
      await userEvent.type(nameInput, longName);

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/name must be less than 100 characters/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when end time is before start time', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      // Set start time after end time
      const startTimeInput = screen.getByLabelText(/start time/i);
      const endTimeInput = screen.getByLabelText(/end time/i);
      await userEvent.clear(startTimeInput);
      await userEvent.type(startTimeInput, '18:00');
      await userEvent.clear(endTimeInput);
      await userEvent.type(endTimeInput, '09:00');

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when weekly window has no days selected', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      // Change to weekly window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/weekly - specific days of the week/i));

      // Submit without selecting any days (all days are deselected by default for weekly)
      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/at least one day must be selected for weekly windows/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when date range is missing dates', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      // Change to date range window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/date range - specific date period/i));

      // Submit without setting dates
      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/start date is required/i)).toBeInTheDocument();
        expect(screen.getByText(/end date is required/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should show error when end date is before start date', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      // Change to date range window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/date range - specific date period/i));

      await waitFor(() => {
        const startDateInput = screen.getByLabelText(/start date/i);
        const endDateInput = screen.getByLabelText(/end date/i);
        expect(startDateInput).toBeInTheDocument();
        expect(endDateInput).toBeInTheDocument();
      });

      const startDateInput = screen.getByLabelText(/start date/i);
      const endDateInput = screen.getByLabelText(/end date/i);
      await userEvent.type(startDateInput, '2024-12-31');
      await userEvent.type(endDateInput, '2024-01-01');

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('should submit valid daily window', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Daily Window');

      const startTimeInput = screen.getByLabelText(/start time/i);
      const endTimeInput = screen.getByLabelText(/end time/i);
      await userEvent.clear(startTimeInput);
      await userEvent.type(startTimeInput, '08:00');
      await userEvent.clear(endTimeInput);
      await userEvent.type(endTimeInput, '18:00');

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      expect(mockOnSave).toHaveBeenCalledWith({
        name: 'Test Daily Window',
        windowType: 'daily',
        startTime: '08:00',
        endTime: '18:00',
        daysOfWeek: undefined,
        startDate: undefined,
        endDate: undefined,
        timezone: 'UTC',
        isActive: true,
      });
    });

    it('should submit valid weekly window', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Weekly Window');

      // Change to weekly window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/weekly - specific days of the week/i));

      // Select Monday and Tuesday
      await waitFor(() => {
        expect(screen.getByText('Mon')).toBeInTheDocument();
      });
      
      const mondayButton = screen.getByText('Mon');
      const tuesdayButton = screen.getByText('Tue');
      await userEvent.click(mondayButton);
      await userEvent.click(tuesdayButton);

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      expect(mockOnSave).toHaveBeenCalledWith({
        name: 'Test Weekly Window',
        windowType: 'weekly',
        startTime: '09:00',
        endTime: '17:00',
        daysOfWeek: [1, 2], // Monday and Tuesday
        startDate: undefined,
        endDate: undefined,
        timezone: 'UTC',
        isActive: true,
      });
    });

    it('should submit valid date range window', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Date Range Window');

      // Change to date range window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/date range - specific date period/i));

      await waitFor(() => {
        const startDateInput = screen.getByLabelText(/start date/i);
        const endDateInput = screen.getByLabelText(/end date/i);
        expect(startDateInput).toBeInTheDocument();
        expect(endDateInput).toBeInTheDocument();
      });

      const startDateInput = screen.getByLabelText(/start date/i);
      const endDateInput = screen.getByLabelText(/end date/i);
      await userEvent.type(startDateInput, '2024-01-01');
      await userEvent.type(endDateInput, '2024-01-31');

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      expect(mockOnSave).toHaveBeenCalledWith({
        name: 'Test Date Range Window',
        windowType: 'date_range',
        startTime: undefined,
        endTime: undefined,
        daysOfWeek: undefined,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        timezone: 'UTC',
        isActive: true,
      });
    });

    it('should toggle active status', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      // Toggle active status to false
      const toggleButton = screen.getByText(/this time window is active/i).closest('button');
      expect(toggleButton).toBeInTheDocument();
      await userEvent.click(toggleButton!);

      await waitFor(() => {
        expect(screen.getByText(/this time window is disabled/i)).toBeInTheDocument();
      });

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
        })
      );
    });

    it('should change timezone', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Window');

      // Change timezone
      const timezoneSelect = screen.getByTestId('timezone-select');
      await userEvent.click(timezoneSelect);
      await userEvent.click(screen.getByText('America/New_York'));

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'America/New_York',
        })
      );
    });
  });

  describe('User Interactions', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const cancelButton = screen.getByText(/cancel/i);
      await userEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should clear validation error when user starts typing', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      // Submit to trigger validation error
      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/time window name is required/i)).toBeInTheDocument();
      });

      // Start typing to clear error
      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'T');

      await waitFor(() => {
        expect(screen.queryByText(/time window name is required/i)).not.toBeInTheDocument();
      });
    });

    it('should disable form when loading', () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isLoading={true}
        />
      );

      expect(screen.getByLabelText(/time window name/i)).toBeDisabled();
      expect(screen.getByText(/saving.../i)).toBeInTheDocument();
    });

    it('should handle day selection for weekly windows', async () => {
      render(
        <TimeWindowForm
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByLabelText(/time window name/i);
      await userEvent.type(nameInput, 'Test Weekly Window');

      // Change to weekly window type
      const windowTypeSelect = screen.getByTestId('window-type-select');
      await userEvent.click(windowTypeSelect);
      await userEvent.click(screen.getByText(/weekly - specific days of the week/i));

      await waitFor(() => {
        expect(screen.getByText('Mon')).toBeInTheDocument();
      });

      // Click Monday to select it
      const mondayButton = screen.getByText('Mon');
      await userEvent.click(mondayButton);

      // Click Monday again to deselect it
      await userEvent.click(mondayButton);

      const submitButton = screen.getByText(/create window/i);
      await userEvent.click(submitButton);

      // Should show validation error since no days selected
      await waitFor(() => {
        expect(screen.getByText(/at least one day must be selected for weekly windows/i)).toBeInTheDocument();
      });
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });
});