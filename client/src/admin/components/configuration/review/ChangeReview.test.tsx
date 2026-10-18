import { configSchema } from 'librechat-data-provider';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TranslationKeys } from '~/hooks';
import type * as t from '~/admin/types';
import { holdErrorToasts, notifyError } from '~/admin/utils';
import { extractSchemaTree } from '~/admin/api/config';
import { summarizeChanges, applySaves } from './diff';
import { ChangeReview } from './ChangeReview';
import { buildReviewModel } from './group';
import { createToast } from '~/admin/ui';
import i18n from '~/locales/i18n';

jest.mock('~/admin/ui', () => {
  const actual = jest.requireActual('~/admin/ui');
  return { ...actual, createToast: jest.fn() };
});

const tree = extractSchemaTree(configSchema as t.ZodSchemaLike);
const localize: t.LocalizeFn = (key, options) =>
  String(i18n.t(key as TranslationKeys, options ?? {}));

const baseline: t.ConfigRecord = {
  endpoints: {
    custom: [
      { name: 'Moonshot', baseURL: 'https://api.moonshot.ai/v1', apiKey: '${MOONSHOT_KEY}' },
      { name: 'Zai 2', baseURL: 'https://zai.example/v1' },
    ],
  },
  registration: { socialLogins: ['openid', 'google'] },
};

function reviewFor(
  saves: t.SaveEntry[],
  overrides: Partial<t.ChangeReviewState> = {},
  issues: t.ReviewIssue[] = [],
): t.ChangeReviewState {
  const items = summarizeChanges({
    saves,
    resets: [],
    baseline,
    ownAt: () => undefined,
    isOwned: () => true,
    lowerAt: () => undefined,
    yamlEntries: () => new Set(['Zai 2']),
    isScope: false,
    fields: tree,
    schemaPaths: new Set(),
  });
  const model = buildReviewModel(
    items,
    { localize, fields: tree, tree: applySaves(baseline, saves) },
    issues,
  );
  return {
    model,
    open: true,
    saving: false,
    sessionExpired: false,
    saveIssues: [],
    title: 'Review',
    blocked: issues.some((issue) => issue.blocking),
    isDirty: true,
    openReview: jest.fn(),
    closeReview: jest.fn(),
    confirm: jest.fn().mockResolvedValue(undefined),
    revertRow: jest.fn(),
    goToRow: jest.fn(),
    discardAll: jest.fn(),
    ...overrides,
  };
}

describe('ChangeReview', () => {
  it('offers to sign in again, in a new tab, when the session ended', () => {
    render(
      <ChangeReview
        review={reviewFor([{ fieldPath: 'registration.socialLogins', value: ['openid'] }], {
          sessionExpired: true,
          saveIssues: [{ message: 'Your session ended', blocking: false }],
        })}
      />,
    );
    const link = screen.getByRole('link', { name: /sign in again/i });
    expect(link).toHaveAttribute('href', '/login');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows list changes as added and removed items', () => {
    render(
      <ChangeReview
        review={reviewFor([
          { fieldPath: 'registration.socialLogins', value: ['openid', 'github'] },
        ])}
      />,
    );
    expect(screen.getByLabelText('Added: github')).toBeInTheDocument();
    expect(screen.getByLabelText('Removed: google')).toBeInTheDocument();
    expect(screen.getByText('Social logins')).toBeInTheDocument();
  });

  it('shows a keyed list change per entry, by name', () => {
    const value = [
      { name: 'Moonshot', baseURL: 'https://api.moonshot.cn/v1', apiKey: '${MOONSHOT_KEY}' },
    ];
    render(<ChangeReview review={reviewFor([{ fieldPath: 'endpoints.custom', value }])} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Zai 2')).toBeInTheDocument();
    expect(within(dialog).getByText('Removed endpoint')).toBeInTheDocument();
    expect(within(dialog).getByText('Moonshot')).toBeInTheDocument();
    expect(within(dialog).getByText('Base URL')).toBeInTheDocument();
    expect(within(dialog).getByText('https://api.moonshot.cn/v1')).toBeInTheDocument();
    expect(dialog.textContent).not.toContain('apiKey:');
  });

  it('never renders a typed secret', () => {
    const value = [
      { name: 'Moonshot', baseURL: 'https://api.moonshot.ai/v1', apiKey: 'sk-typed-secret' },
      { name: 'Zai 2', baseURL: 'https://zai.example/v1' },
      { name: 'New', baseURL: 'https://new.example', apiKey: 'sk-new-secret' },
    ];
    render(<ChangeReview review={reviewFor([{ fieldPath: 'endpoints.custom', value }])} />);
    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).not.toContain('sk-typed-secret');
    expect(text).not.toContain('sk-new-secret');
    expect(text).toContain('${MOONSHOT_KEY}');
    expect(text).toContain('Will be replaced (hidden)');
    expect(text).toContain('Will be set (hidden)');
  });

  it('disables Save while blocking problems exist and offers to jump to the first', () => {
    const issue: t.ReviewIssue = {
      path: 'registration.socialLogins',
      label: 'System › Registration › Social logins',
      message: 'Invalid',
      blocking: true,
    };
    const review = reviewFor([{ fieldPath: 'registration.socialLogins', value: ['openid'] }], {}, [
      issue,
    ]);
    render(<ChangeReview review={review} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Jump to first error' }));
    expect(review.goToRow).toHaveBeenCalledWith(issue);
  });

  it('wires per-row Revert and Go to field', () => {
    const review = reviewFor([{ fieldPath: 'registration.socialLogins', value: ['openid'] }]);
    render(<ChangeReview review={review} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revert Social logins' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Social logins' }));
    expect(review.revertRow).toHaveBeenCalledTimes(1);
    expect(review.goToRow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('error toasts', () => {
  it('are held while the review shows errors itself, and summarized otherwise', () => {
    const toast = jest.mocked(createToast);
    toast.mockClear();
    const release = holdErrorToasts();
    notifyError('Validation failed — a.b: bad');
    expect(toast).not.toHaveBeenCalled();
    release();
    notifyError('Validation failed — a.b: bad; c.d: worse');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Validation failed', description: 'a.b: bad\nc.d: worse' }),
    );
  });
});
