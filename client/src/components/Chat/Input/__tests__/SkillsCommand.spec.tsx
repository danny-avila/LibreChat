/**
 * Locks in the selection-flow contract that the follow-up `manualSkills`
 * PR has to honor: when a user picks a skill in the `$` popover the
 * component must (a) push the skill name onto the per-conversation
 * `pendingManualSkillsByConvoId` atom, (b) flip `ephemeralAgent.skills`
 * to true, and (c) insert `$skill-name ` into the textarea.
 */
import React from 'react';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';

const CONVO_ID = 'convo-1';

const mockSetShowSkillsPopover = jest.fn();
const mockSetEphemeralAgent = jest.fn();
const mockSetPendingManualSkills = jest.fn();
const mockShowSkillsPopover = { current: true };

jest.mock('recoil', () => {
  const actual = jest.requireActual('recoil');
  return {
    ...actual,
    useRecoilValue: jest.fn((atom: unknown) => {
      if (atom === 'show-skills-popover') {
        return mockShowSkillsPopover.current;
      }
      return undefined;
    }),
    useRecoilState: jest.fn(() => [null, jest.fn()]),
    useSetRecoilState: jest.fn((atom: unknown) => {
      if (atom === 'show-skills-popover') {
        return mockSetShowSkillsPopover;
      }
      if (atom === 'ephemeral-agent') {
        return mockSetEphemeralAgent;
      }
      if (atom === 'pending-manual-skills') {
        return mockSetPendingManualSkills;
      }
      return jest.fn();
    }),
  };
});

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    showSkillsPopoverFamily: () => 'show-skills-popover',
    pendingManualSkillsByConvoId: () => 'pending-manual-skills',
  },
  ephemeralAgentByConvoId: () => 'ephemeral-agent',
  pendingManualSkillsByConvoId: () => 'pending-manual-skills',
}));

const mockUseSkillsInfiniteQuery = jest.fn();
jest.mock('~/data-provider', () => ({
  useSkillsInfiniteQuery: () => mockUseSkillsInfiniteQuery(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    Spinner: () => null,
  };
});

/* react-virtualized renders nothing in jsdom without measured size; replace
   AutoSizer + List with a flat ul so row clicks are exercised normally. */
jest.mock('react-virtualized', () => ({
  ...jest.requireActual('react-virtualized'),
  AutoSizer: ({ children }: { children: (size: { width: number }) => React.ReactNode }) =>
    children({ width: 320 }),
  List: ({
    rowCount,
    rowRenderer,
  }: {
    rowCount: number;
    rowRenderer: (args: {
      index: number;
      key: string;
      style: React.CSSProperties;
    }) => React.ReactNode;
  }) => {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push(rowRenderer({ index: i, key: `row-${i}`, style: {} }));
    }
    return <ul data-testid="skills-list">{rows}</ul>;
  },
}));

import SkillsCommand from '../SkillsCommand';

const makeTextarea = (initial = '$') => {
  const textarea = document.createElement('textarea');
  textarea.value = initial;
  document.body.appendChild(textarea);
  return { current: textarea } as React.MutableRefObject<HTMLTextAreaElement | null>;
};

const skillsResponse = {
  pages: [
    {
      skills: [
        {
          _id: '1',
          name: 'brand-guidelines',
          displayTitle: 'Brand Guidelines',
          description: 'Apply brand styling',
          author: 'u',
          authorName: 'U',
          version: 1,
          source: 'inline',
          fileCount: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      has_more: false,
      after: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  mockShowSkillsPopover.current = true;
  mockUseSkillsInfiniteQuery.mockReturnValue({
    data: skillsResponse,
    isLoading: false,
    isError: false,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
});

describe('SkillsCommand', () => {
  it('renders nothing when the popover atom is false', () => {
    mockShowSkillsPopover.current = false;
    const textAreaRef = makeTextarea();
    const { container } = render(
      <SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('selecting a skill pushes to pendingManualSkillsByConvoId, flips ephemeralAgent.skills, inserts $name into textarea, and closes the popover', async () => {
    const user = userEvent.setup();
    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    const skillButton = await screen.findByRole('button', { name: /Brand Guidelines/i });
    await act(async () => {
      await user.click(skillButton);
    });

    /* Structured channel: the skill name is pushed into the per-convo atom,
       which is the contract the follow-up PR depends on. */
    expect(mockSetPendingManualSkills).toHaveBeenCalledTimes(1);
    const updater = mockSetPendingManualSkills.mock.calls[0][0] as (prev: string[]) => string[];
    expect(updater([])).toEqual(['brand-guidelines']);
    expect(updater(['brand-guidelines'])).toEqual(['brand-guidelines']);

    /* Ephemeral agent gets skills enabled so the badge lights up and the
       backend includes the skill catalog. */
    expect(mockSetEphemeralAgent).toHaveBeenCalledTimes(1);
    const agentUpdater = mockSetEphemeralAgent.mock.calls[0][0] as (
      prev: { skills?: boolean } | null,
    ) => { skills?: boolean };
    expect(agentUpdater(null)).toEqual({ skills: true });
    expect(agentUpdater({ skills: true })).toEqual({ skills: true });

    /* Cosmetic textarea insertion remains in place for user feedback. */
    expect(textAreaRef.current?.value).toBe('$brand-guidelines ');

    /* Popover dismisses on selection. */
    expect(mockSetShowSkillsPopover).toHaveBeenCalledWith(false);
  });
});
