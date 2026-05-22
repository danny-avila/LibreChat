/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectEndIn"] }] */

import userEvent from '@testing-library/user-event';
import { render } from 'test/layout-test-utils';
import { screen, within } from '@testing-library/react';
import type { TFile } from 'librechat-data-provider';
import FilesPanel from '~/nj/components/SidePanel/Files/FilesPanel';

// FileCell has complex dependencies (React Query mutations, toast context, etc.)
// that are irrelevant to FilesPanel's own logic, so we stub it out.
jest.mock('~/nj/components/SidePanel/Files/FileCell', () => ({
  __esModule: true,
  default: ({ file, onFileClick }: { file: TFile; onFileClick: (f: TFile) => void }) => (
    <button data-testid={`file-${file.file_id}`} onClick={() => onFileClick(file)}>
      {file.filename}
    </button>
  ),
}));

const baseFile: TFile = {
  user: 'user1',
  file_id: 'f1',
  bytes: 100,
  embedded: false,
  filename: 'report.pdf',
  filepath: '/uploads/report.pdf',
  object: 'file',
  type: 'application/pdf',
  usage: 0,
};

function makeFile(overrides: Partial<TFile>): TFile {
  return { ...baseFile, ...overrides };
}

const TODAY = '2025-05-21T10:00:00Z';
const YESTERDAY = '2025-05-20T10:00:00Z';
const PREVIOUS = '2025-05-01T10:00:00Z';

function section(name: string) {
  return within(screen.getByRole('region', { name: new RegExp(name, 'i') }));
}

describe('FilesPanel', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2025-05-21T12:00:00Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  // userEvent needs advanceTimers so it can work with fake timers
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });

  describe('filename filter', () => {
    test('shows all files when filter is empty', () => {
      const files = [
        makeFile({ file_id: 'a', filename: 'alpha.pdf' }),
        makeFile({ file_id: 'b', filename: 'beta.pdf' }),
      ];

      render(<FilesPanel files={files} handleFileClick={jest.fn()} />);

      expect(screen.getByText('alpha.pdf')).toBeInTheDocument();
      expect(screen.getByText('beta.pdf')).toBeInTheDocument();
    });

    test('filters files by filename substring (case insensitive)', async () => {
      const files = [
        makeFile({ file_id: 'a', filename: 'alpha.pdf' }),
        makeFile({ file_id: 'b', filename: 'beta.pdf' }),
      ];

      render(<FilesPanel files={files} handleFileClick={jest.fn()} />);

      const input = screen.getByRole('textbox', { name: /filter files/i });
      await user.type(input, 'Alp');

      expect(screen.getByText('alpha.pdf')).toBeInTheDocument();
      expect(screen.queryByText('beta.pdf')).not.toBeInTheDocument();
    });
  });

  describe('pinned section', () => {
    test('always renders pinned section, even when empty', () => {
      render(<FilesPanel files={[]} handleFileClick={jest.fn()} />);

      expect(screen.getByText('Pinned')).toBeInTheDocument();
      expect(screen.getByText(/nothing pinned yet/i)).toBeInTheDocument();
    });

    test('pinned files appear in Pinned section, not in date sections', () => {
      const files = [
        makeFile({ file_id: 'p1', filename: 'pinned.pdf', pinned: true }),
        makeFile({ file_id: 't1', filename: 'today.pdf' }),
      ];

      render(<FilesPanel files={files} handleFileClick={jest.fn()} />);

      expect(section('Pinned').getByText('pinned.pdf')).toBeInTheDocument();
      expect(screen.getAllByText('pinned.pdf')).toHaveLength(1);
    });
  });

  describe('isLastVisibleSection logic', () => {
    function expectEndIn(name: string) {
      expect(screen.queryAllByText(/you've reached the end/i)).toHaveLength(1);
      expect(section(name).getByText(/you've reached the end/i)).toBeInTheDocument();
    }

    test.each([
      [
        'Previous',
        [
          makeFile({ file_id: 'p1', filename: 'pinned.pdf', pinned: true, updatedAt: TODAY }),
          makeFile({ file_id: 'a', filename: 'today.pdf', createdAt: TODAY }),
          makeFile({ file_id: 'b', filename: 'yesterday.pdf', createdAt: YESTERDAY }),
          makeFile({ file_id: 'c', filename: 'old.pdf', createdAt: PREVIOUS }),
        ],
      ],
      [
        'Yesterday',
        [
          makeFile({ file_id: 'p1', filename: 'pinned.pdf', pinned: true, updatedAt: TODAY }),
          makeFile({ file_id: 'a', filename: 'today.pdf', createdAt: TODAY }),
          makeFile({ file_id: 'b', filename: 'yesterday.pdf', createdAt: YESTERDAY }),
        ],
      ],
      [
        'Today',
        [
          makeFile({ file_id: 'p1', filename: 'pinned.pdf', pinned: true, updatedAt: TODAY }),
          makeFile({ file_id: 'a', filename: 'today.pdf', createdAt: TODAY }),
        ],
      ],
      [
        'Pinned',
        [makeFile({ file_id: 'p1', filename: 'pinned.pdf', pinned: true, updatedAt: TODAY })],
      ],
    ])('%s section shows end indicator when it is last', (lastSection, files) => {
      render(<FilesPanel files={files} handleFileClick={jest.fn()} />);
      expectEndIn(lastSection);
    });

    test('filter shifts the end indicator to the new last visible section', async () => {
      const files = [
        makeFile({ file_id: 'a', filename: 'today.pdf', createdAt: TODAY }),
        makeFile({ file_id: 'b', filename: 'old.pdf', createdAt: PREVIOUS }),
      ];

      render(<FilesPanel files={files} handleFileClick={jest.fn()} />);
      expectEndIn('Previous');

      await user.type(screen.getByRole('textbox', { name: /filter files/i }), 'today');
      expectEndIn('Today');
    });
  });

  describe('handleFileClick', () => {
    test('calls handleFileClick with the correct file', async () => {
      const handleFileClick = jest.fn();
      const fileA = makeFile({ file_id: 'a', filename: 'alpha.pdf', createdAt: TODAY });
      const fileB = makeFile({ file_id: 'b', filename: 'beta.pdf', createdAt: YESTERDAY });

      render(<FilesPanel files={[fileA, fileB]} handleFileClick={handleFileClick} />);

      await user.click(screen.getByTestId('file-b'));
      expect(handleFileClick).toHaveBeenCalledWith(fileB);

      await user.click(screen.getByTestId('file-a'));
      expect(handleFileClick).toHaveBeenCalledWith(fileA);

      expect(handleFileClick).toHaveBeenCalledTimes(2);
    });
  });
});
