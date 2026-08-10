import { render } from '@testing-library/react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import ActivityPhaseGroup from '../ActivityPhaseGroup';

const labelPart = {
  type: ContentTypes.ACTIVITY_LABEL,
  [ContentTypes.ACTIVITY_LABEL]: 'Compared both release paths',
  activity_label_type: 'phase',
  activity_start_index: 0,
  pending: false,
} as unknown as Extract<TMessageContentParts, { type: ContentTypes.ACTIVITY_LABEL }>;

describe('ActivityPhaseGroup', () => {
  test('renders a streaming cursor after an active tail phase', () => {
    const { container } = render(
      <ActivityPhaseGroup labelPart={labelPart} hasContent showCursor>
        <div data-testid="phase-content" />
      </ActivityPhaseGroup>,
    );

    expect(container.querySelector('.result-thinking')).toBeInTheDocument();
  });
});
