import { render } from 'test/layout-test-utils';
import { screen } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { newUpdatesWidgetDismissed } from '~/nj/store/landing';
import NewUpdatesWidget from '../NewUpdatesWidget';

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-04-16'));
});

afterAll(() => {
  jest.useRealTimers();
});

jest.mock('~/nj/content/release-notes.md?raw', () => ({
  __esModule: true,
  default: '## April 14, 2026\nFeatures Released...',
}));

describe('NewUpdatesWidget', () => {
  describe('show', () => {
    test('shows when within 4 days and not dismissed', async () => {
      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(newUpdatesWidgetDismissed, null);
          }}
        >
          <NewUpdatesWidget />
        </RecoilRoot>,
      );

      expect(screen.getByText('AI Office Hours')).toBeInTheDocument();
    });

    test('shows when new release date differs from dismissed date', async () => {
      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(newUpdatesWidgetDismissed, 'April 15, 2026');
          }}
        >
          <NewUpdatesWidget />
        </RecoilRoot>,
      );

      await expect(screen.getByText('AI Office Hours')).toBeInTheDocument();
    });
  });

  describe('hide', () => {
    test('hides when dismissed for current release', async () => {
      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(newUpdatesWidgetDismissed, 'April 14, 2026');
          }}
        >
          <NewUpdatesWidget />
        </RecoilRoot>,
      );

      await expect(screen.queryByText('AI Office Hours')).not.toBeInTheDocument();
    });

    test('hides when release date is greater than 4 days', async () => {
      jest.setSystemTime(new Date('2026-04-21'));

      render(
        <RecoilRoot
          initializeState={({ set }) => {
            set(newUpdatesWidgetDismissed, null);
          }}
        >
          <NewUpdatesWidget />
        </RecoilRoot>,
      );

      await expect(screen.queryByText('AI Office Hours')).toBeNull();
    });
  });
});
