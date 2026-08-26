import { render, fireEvent, waitFor } from '@testing-library/react';
import WeekStartSelector from './WeekStartSelector';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('WeekStartSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    } as unknown as typeof ResizeObserver;
  });

  it('renders with System selected by default', () => {
    const { getByText, getByTestId } = render(<WeekStartSelector />);

    expect(getByText('com_nav_week_start')).toBeInTheDocument();
    expect(getByTestId('week-start-selector')).toHaveTextContent('com_nav_week_start_system');
  });

  it('persists the selected preference to the weekStart atom', async () => {
    const { getByTestId, getByText } = render(<WeekStartSelector />);

    fireEvent.click(getByTestId('week-start-selector'));
    fireEvent.click(getByText('com_nav_week_start_monday'));

    await waitFor(() => {
      expect(getByTestId('week-start-selector')).toHaveTextContent('com_nav_week_start_monday');
    });
    expect(JSON.parse(localStorage.getItem('weekStart') ?? '""')).toBe('monday');
  });
});
