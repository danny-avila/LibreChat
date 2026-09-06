import React from 'react';
import { act, render, screen } from '@testing-library/react';
import MessageTimestamp from '../ui/MessageTimestamp';

const MINUTE_MS = 60_000;
const NOW = new Date('2026-06-12T15:42:00.000Z').getTime();

describe('MessageTimestamp refresh boundaries', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refreshes rounded hours on the minute that the displayed value changes', () => {
    const value = new Date(NOW - 89 * MINUTE_MS).toISOString();
    render(<MessageTimestamp value={value} />);
    expect(screen.getByText('1 hour ago')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(2 * MINUTE_MS));
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('switches to the absolute date when the message leaves the recent window', () => {
    const value = new Date(NOW - (24 * 60 - 1) * MINUTE_MS).toISOString();
    const { container } = render(<MessageTimestamp value={value} />);
    const timestamp = container.querySelector('time');
    const absolute = timestamp?.getAttribute('title');
    expect(absolute).toBeTruthy();

    act(() => jest.advanceTimersByTime(2 * MINUTE_MS));
    expect(timestamp).toHaveTextContent(absolute!);
    expect(timestamp).not.toHaveAttribute('title');
  });
});
