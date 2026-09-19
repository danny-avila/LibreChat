import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import type { TMediaInsights } from 'librechat-data-provider';
import MediaInsights from '../Media';

jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));

const summary = {
  submitted: 7,
  completed: 3,
  failed: 1,
  cancelled: 1,
  active: 1,
  uncertain: 1,
  providerCostUSD: 1,
  operatorCostUSD: 4,
  estimatedCostUSD: 2,
  unclassifiedCostUSD: 3,
  unknownCostJobs: 1,
};
const data: TMediaInsights = {
  summary,
  offerings: [
    { ...summary, provider: 'openai.images', model: 'image-model', operation: 'image.generate' },
  ],
  page: 1,
  pageSize: 5,
  pages: 2,
};

it('exposes explicit Studio activity and paginates offerings without changing chat filters', async () => {
  const onPage = jest.fn();
  render(<MediaInsights data={data} isFetching={false} onPage={onPage} />);
  const panel = screen.getByRole('region', { name: 'com_insights_media_title' });
  expect(within(panel).getByText('com_insights_media_scope')).toBeVisible();
  expect(within(panel).getByText('openai.images')).toBeVisible();
  expect(within(panel).getByText('com_media_image_generate')).toBeVisible();
  expect(within(panel).getByRole('button', { name: 'com_ui_prev' })).toBeDisabled();
  await userEvent.click(within(panel).getByRole('button', { name: 'com_ui_next' }));
  expect(onPage).toHaveBeenCalledWith(2);
});

it('shows the shared empty state and disables pagination during refetch', () => {
  const { rerender } = render(<MediaInsights data={data} isFetching onPage={() => undefined} />);
  expect(screen.getByRole('button', { name: 'com_ui_next' })).toBeDisabled();
  rerender(
    <MediaInsights
      data={{ ...data, summary: { ...summary, submitted: 0 }, offerings: [] }}
      isFetching={false}
      onPage={() => undefined}
    />,
  );
  expect(screen.getByText('com_insights_no_data')).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
