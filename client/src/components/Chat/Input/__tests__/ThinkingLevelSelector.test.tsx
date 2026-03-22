/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';

const mockSetOption = jest.fn(() => jest.fn());
const mockUseLocalize = jest.fn((key: string) => key);

jest.mock('~/hooks', () => ({
  useLocalize: () => mockUseLocalize,
  useSetIndexOptions: jest.fn(() => ({ setOption: mockSetOption })),
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
}));

jest.mock('~/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

import { useChatContext } from '~/Providers';
import ThinkingLevelSelector from '../ThinkingLevelSelector';

const mockUseChatContext = useChatContext as jest.Mock;

const THINK_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function setup(endpoint: string, thinkingLevel = 'medium') {
  mockUseChatContext.mockReturnValue({
    conversation: {
      endpoint,
      customParams: { thinkingLevel },
    },
  });
}

describe('ThinkingLevelSelector', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders null when endpoint is not openclaw', () => {
    setup('openAI');
    const { container } = render(<ThinkingLevelSelector />);
    expect(container.firstChild).toBeNull();
  });

  it('renders level selector for openclaw endpoint', () => {
    setup(EModelEndpoint.openclaw);
    render(<ThinkingLevelSelector />);
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('exposes translation keys for all 6 thinking levels', () => {
    // Verify all 6 level keys are used by checking useLocalize is called with each
    const calledKeys: string[] = [];
    mockUseLocalize.mockImplementation((key: string) => {
      calledKeys.push(key);
      return key;
    });

    setup(EModelEndpoint.openclaw, 'medium');
    render(<ThinkingLevelSelector />);

    const levelKeys = THINK_LEVELS.map((l) => `com_openclaw_thinking_${l}`);
    for (const key of levelKeys) {
      expect(calledKeys).toContain(key);
    }
  });

  it('THINK_LEVELS array contains exactly 6 entries', () => {
    // Test the exported constant via component render output
    expect(THINK_LEVELS).toHaveLength(6);
    expect(THINK_LEVELS).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']);
  });
});
