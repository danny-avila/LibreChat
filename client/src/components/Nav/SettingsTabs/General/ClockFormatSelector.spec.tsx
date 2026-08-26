import { render, fireEvent, waitFor } from '@testing-library/react';
import ClockFormatSelector from './ClockFormatSelector';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('ClockFormatSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    global.ResizeObserver = class MockedResizeObserver {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    } as unknown as typeof ResizeObserver;
  });

  it('renders with System selected by default', () => {
    const { getByText, getByTestId } = render(<ClockFormatSelector />);

    expect(getByText('com_nav_clock_format')).toBeInTheDocument();
    expect(getByTestId('clock-format-selector')).toHaveTextContent('com_nav_clock_format_system');
  });

  it('persists the selected preference to the clockFormat atom', async () => {
    const { getByTestId, getByText } = render(<ClockFormatSelector />);

    fireEvent.click(getByTestId('clock-format-selector'));
    fireEvent.click(getByText('com_nav_clock_format_24h'));

    await waitFor(() => {
      expect(getByTestId('clock-format-selector')).toHaveTextContent('com_nav_clock_format_24h');
    });
    expect(JSON.parse(localStorage.getItem('clockFormat') ?? '""')).toBe('24h');
  });
});
