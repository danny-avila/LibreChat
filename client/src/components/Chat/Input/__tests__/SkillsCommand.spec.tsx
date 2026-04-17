/**
 * Locks in the selection-flow contract that the follow-up `manualSkills`
 * PR has to honor: when a user picks a skill in the `$` popover the
 * component must (a) push the skill name onto the per-conversation
 * `pendingManualSkillsByConvoId` atom, (b) flip `ephemeralAgent.skills`
 * to true, and (c) insert `$skill-name ` into the textarea.
 *
 * Also covers the Phase 2 filter composition: per-agent skill scope
 * intersects with the ACL catalog, and per-user active-state toggles
 * hide inactive entries from the popover (backend still enforces both
 * at runtime regardless).
 */
import React from 'react';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { InvocationMode } from 'librechat-data-provider';
import type { TSkillSummary } from 'librechat-data-provider';

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

/* Phase 2: the popover must consult useChatContext() for the current
   conversation's agent_id and useAgentsMapContext() for its `skills`
   config, then intersect that with the ACL catalog. The test harness
   swaps these in so individual cases can configure ephemeral vs.
   agent-scoped behavior without standing up real providers. */
const mockUseChatContext = jest.fn();
const mockUseAgentsMapContext = jest.fn();
jest.mock('~/Providers', () => ({
  useChatContext: () => mockUseChatContext(),
  useAgentsMapContext: () => mockUseAgentsMapContext(),
}));

const mockIsActive = jest.fn();
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSkillActiveState: () => ({ isActive: mockIsActive }),
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

import SkillsCommand, { filterSkillsForPopover } from '../SkillsCommand';

const makeTextarea = (initial = '$') => {
  const textarea = document.createElement('textarea');
  textarea.value = initial;
  document.body.appendChild(textarea);
  return { current: textarea } as React.MutableRefObject<HTMLTextAreaElement | null>;
};

const makeSkill = (overrides: Partial<TSkillSummary>): TSkillSummary => ({
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
  ...overrides,
});

const skillsResponse = {
  pages: [
    {
      skills: [makeSkill({})],
      has_more: false,
      after: null,
    },
  ],
};

const twoSkillsResponse = {
  pages: [
    {
      skills: [
        makeSkill({ _id: '1', name: 'brand-guidelines', displayTitle: 'Brand Guidelines' }),
        makeSkill({ _id: '2', name: 'style-guide', displayTitle: 'Style Guide' }),
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
  /* Defaults: ephemeral conversation (no agent) and every skill active.
     Individual tests override these to exercise the Phase 2 filter. */
  mockUseChatContext.mockReturnValue({ conversation: { conversationId: CONVO_ID } });
  mockUseAgentsMapContext.mockReturnValue({});
  mockIsActive.mockReturnValue(true);
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

  it('narrows the list to the agent-configured scope when agent.skills is set', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseChatContext.mockReturnValue({
      conversation: { conversationId: CONVO_ID, agent_id: 'agent-1' },
    });
    mockUseAgentsMapContext.mockReturnValue({
      'agent-1': { id: 'agent-1', skills: ['2'] },
    });

    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    /* Only the skill whose _id is in agent.skills should appear. */
    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(await screen.findByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });

  it('shows nothing when the agent has an empty skills array (explicit opt-out)', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseChatContext.mockReturnValue({
      conversation: { conversationId: CONVO_ID, agent_id: 'agent-1' },
    });
    mockUseAgentsMapContext.mockReturnValue({
      'agent-1': { id: 'agent-1', skills: [] },
    });

    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Style Guide/i })).toBeNull();
  });

  it('shows the full ACL catalog when the agent has no skills field configured', async () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseChatContext.mockReturnValue({
      conversation: { conversationId: CONVO_ID, agent_id: 'agent-1' },
    });
    mockUseAgentsMapContext.mockReturnValue({
      'agent-1': { id: 'agent-1' },
    });

    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    expect(await screen.findByRole('button', { name: /Brand Guidelines/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });

  it('hides inactive skills from the popover', () => {
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: twoSkillsResponse,
      isLoading: false,
      isError: false,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockIsActive.mockImplementation((skill: { _id: string }) => skill._id !== '1');

    const textAreaRef = makeTextarea('$');
    render(<SkillsCommand index={0} textAreaRef={textAreaRef} conversationId={CONVO_ID} />);

    expect(screen.queryByRole('button', { name: /Brand Guidelines/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Style Guide/i })).toBeInTheDocument();
  });
});

describe('filterSkillsForPopover', () => {
  const active = () => true;
  const inactive = () => false;
  const s1 = makeSkill({ _id: '1', name: 'a' });
  const s2 = makeSkill({ _id: '2', name: 'b' });
  const s3 = makeSkill({ _id: '3', name: 'c', invocationMode: InvocationMode.auto });

  it('passes everything through when agentSkillIds is undefined', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: undefined, isActive: active });
    expect(out.map((s) => s._id)).toEqual(['1', '2']);
  });

  it('passes everything through when agentSkillIds is null', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: null, isActive: active });
    expect(out.map((s) => s._id)).toEqual(['1', '2']);
  });

  it('returns empty when agentSkillIds is []', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: [], isActive: active });
    expect(out).toEqual([]);
  });

  it('intersects with a non-empty agentSkillIds', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: ['2'], isActive: active });
    expect(out.map((s) => s._id)).toEqual(['2']);
  });

  it('excludes inactive skills', () => {
    const isActive = (skill: { _id: string }) => skill._id !== '1';
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: null, isActive });
    expect(out.map((s) => s._id)).toEqual(['2']);
  });

  it('excludes auto-only skills via isUserInvocable', () => {
    const out = filterSkillsForPopover([s1, s3], { agentSkillIds: null, isActive: active });
    expect(out.map((s) => s._id)).toEqual(['1']);
  });

  it('still empty when agent scope is [] even if everything is active and invocable', () => {
    const out = filterSkillsForPopover([s1, s2, s3], { agentSkillIds: [], isActive: active });
    expect(out).toEqual([]);
  });

  it('layers all three filters (agent scope ∩ active ∩ invocable)', () => {
    const isActive = (skill: { _id: string }) => skill._id !== '2';
    const out = filterSkillsForPopover([s1, s2, s3], {
      agentSkillIds: ['1', '2', '3'],
      isActive,
    });
    /* s1 passes (active, manual-by-default, scoped), s2 drops (inactive),
       s3 drops (auto-only invocation mode). */
    expect(out.map((s) => s._id)).toEqual(['1']);
  });

  it('drops everything when isActive returns false for all inputs', () => {
    const out = filterSkillsForPopover([s1, s2], { agentSkillIds: null, isActive: inactive });
    expect(out).toEqual([]);
  });
});
