import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Feedback from '../Feedback';

const mockTranslations: Record<string, string> = {
  com_ui_feedback_rate: 'Rate response',
  com_ui_feedback_good: 'Good response',
  com_ui_feedback_bad: 'Bad response',
  com_ui_feedback_tag_accurate_reliable: 'Accurate and Reliable',
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => mockTranslations[key] ?? key,
}));

describe('Feedback', () => {
  it('reveals both ratings from one control and preserves reason selection', async () => {
    const handleFeedback = jest.fn();
    render(<Feedback handleFeedback={handleFeedback} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Rate response' }));

    expect(await screen.findByRole('button', { name: 'Good response' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bad response' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accurate and Reliable' }));

    await waitFor(() =>
      expect(handleFeedback).toHaveBeenCalledWith({
        feedback: expect.objectContaining({
          rating: 'thumbsUp',
          tag: expect.objectContaining({ key: 'accurate_reliable' }),
        }),
      }),
    );
  });
});
