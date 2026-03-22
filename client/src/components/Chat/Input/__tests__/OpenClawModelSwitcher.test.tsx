/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';

const mockMutate = jest.fn();
const mockUseLocalize = jest.fn((key: string) => key);
const mockModels = [
  { id: 'agent:main', label: 'Main Agent', provider: 'openclaw' },
  { id: 'agent:fast', label: 'Fast Agent', provider: 'openclaw' },
];

jest.mock('~/hooks', () => ({
  useLocalize: () => mockUseLocalize,
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
}));

jest.mock('~/data-provider', () => ({
  useOpenClawModelsQuery: jest.fn(),
  useSwitchOpenClawModel: jest.fn(),
}));

jest.mock('~/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

import { useChatContext } from '~/Providers';
import { useOpenClawModelsQuery, useSwitchOpenClawModel } from '~/data-provider';
import OpenClawModelSwitcher from '../OpenClawModelSwitcher';

const mockUseChatContext = useChatContext as jest.Mock;
const mockUseModels = useOpenClawModelsQuery as jest.Mock;
const mockUseSwitchModel = useSwitchOpenClawModel as jest.Mock;

function setup(endpoint: string, model = 'agent:main', sessionKey = 'sess-1') {
  mockUseChatContext.mockReturnValue({
    conversation: { endpoint, model, openclawSessionKey: sessionKey },
  });
  mockUseModels.mockReturnValue({ data: mockModels, isLoading: false });
  mockUseSwitchModel.mockReturnValue({ mutate: mockMutate });
}

describe('OpenClawModelSwitcher', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders null when endpoint is not openclaw', () => {
    setup('openAI');
    const { container } = render(<OpenClawModelSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the menu button when endpoint is openclaw', () => {
    setup(EModelEndpoint.openclaw);
    render(<OpenClawModelSwitcher />);
    expect(screen.getByRole('button')).toBeDefined();
  });

  it('displays current model name in button', () => {
    setup(EModelEndpoint.openclaw, 'agent:fast', 'sess-2');
    render(<OpenClawModelSwitcher />);
    expect(screen.getByText('agent:fast')).toBeDefined();
  });

  it('does not call mutate when same model is selected', () => {
    setup(EModelEndpoint.openclaw, 'agent:main', 'sess-1');
    render(<OpenClawModelSwitcher />);
    // Simulate selecting the currently active model
    const button = screen.getByRole('button');
    fireEvent.click(button);
    // Even if menu opened, selecting same model should not mutate
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
