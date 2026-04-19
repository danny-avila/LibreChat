import { render, screen, fireEvent } from '@testing-library/react';
import type { Agent, TModelSpec } from 'librechat-data-provider';
import type { FavoriteModel } from '~/store/favorites';
import FavoriteItem from '../FavoriteItem';

const mockRemoveFavoriteAgent = jest.fn();
const mockRemoveFavoriteModel = jest.fn();
const mockRemoveFavoriteSpec = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFavorites: () => ({
    removeFavoriteAgent: mockRemoveFavoriteAgent,
    removeFavoriteModel: mockRemoveFavoriteModel,
    removeFavoriteSpec: mockRemoveFavoriteSpec,
  }),
}));

jest.mock('~/components/Chat/Menus/Endpoints/components/SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
}));

jest.mock('~/components/Endpoints/MinimalIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="minimal-icon" />,
}));

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  renderAgentAvatar: () => <span data-testid="agent-avatar" />,
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  DropdownPopup: () => <div data-testid="dropdown-popup" />,
}));

jest.mock('@ariakit/react/menu', () => ({
  MenuButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const baseAgent: Agent = {
  id: 'agent-123',
  name: 'Research Agent',
  avatar: null,
  provider: 'openai',
  model: 'gpt-5',
  instructions: '',
  description: '',
  tools: [],
  created_at: 0,
  updated_at: 0,
  author: 'u1',
} as unknown as Agent;

const baseModel: FavoriteModel = { model: 'gpt-5', endpoint: 'openai' };

const baseSpec: TModelSpec = {
  name: 'my-spec',
  label: 'My Model Spec',
  preset: { endpoint: 'openai', model: 'gpt-5' },
};

describe('FavoriteItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('type="agent"', () => {
    it('renders the agent name and avatar', () => {
      const onSelectEndpoint = jest.fn();
      render(<FavoriteItem type="agent" item={baseAgent} onSelectEndpoint={onSelectEndpoint} />);
      expect(screen.getByText('Research Agent')).toBeInTheDocument();
      expect(screen.getByTestId('agent-avatar')).toBeInTheDocument();
    });

    it('has aria-label formatted as "<name> (com_ui_agent)"', () => {
      render(<FavoriteItem type="agent" item={baseAgent} />);
      expect(
        screen.getByRole('button', { name: 'Research Agent (com_ui_agent)' }),
      ).toBeInTheDocument();
    });

    it('calls onSelectEndpoint with agents endpoint + agent_id on click', () => {
      const onSelectEndpoint = jest.fn();
      render(<FavoriteItem type="agent" item={baseAgent} onSelectEndpoint={onSelectEndpoint} />);
      fireEvent.click(screen.getByTestId('favorite-item'));
      expect(onSelectEndpoint).toHaveBeenCalledWith('agents', { agent_id: 'agent-123' });
    });
  });

  describe('type="model"', () => {
    it('renders model name and minimal icon', () => {
      render(<FavoriteItem type="model" item={baseModel} />);
      expect(screen.getByText('gpt-5')).toBeInTheDocument();
      expect(screen.getByTestId('minimal-icon')).toBeInTheDocument();
    });

    it('has aria-label formatted as "<model> (com_ui_model)"', () => {
      render(<FavoriteItem type="model" item={baseModel} />);
      expect(screen.getByRole('button', { name: 'gpt-5 (com_ui_model)' })).toBeInTheDocument();
    });

    it('calls onSelectEndpoint with endpoint + model on click', () => {
      const onSelectEndpoint = jest.fn();
      render(<FavoriteItem type="model" item={baseModel} onSelectEndpoint={onSelectEndpoint} />);
      fireEvent.click(screen.getByTestId('favorite-item'));
      expect(onSelectEndpoint).toHaveBeenCalledWith('openai', { model: 'gpt-5' });
    });
  });

  describe('type="spec"', () => {
    it('renders the spec label and SpecIcon', () => {
      render(<FavoriteItem type="spec" item={baseSpec} />);
      expect(screen.getByText('My Model Spec')).toBeInTheDocument();
      expect(screen.getByTestId('spec-icon')).toBeInTheDocument();
    });

    it('has aria-label formatted as "<label> (com_ui_model_spec)"', () => {
      render(<FavoriteItem type="spec" item={baseSpec} />);
      expect(
        screen.getByRole('button', { name: 'My Model Spec (com_ui_model_spec)' }),
      ).toBeInTheDocument();
    });

    it('calls onSelectSpec with the full spec on click', () => {
      const onSelectSpec = jest.fn();
      render(<FavoriteItem type="spec" item={baseSpec} onSelectSpec={onSelectSpec} />);
      fireEvent.click(screen.getByTestId('favorite-item'));
      expect(onSelectSpec).toHaveBeenCalledWith(baseSpec);
    });

    it('activates on Enter key', () => {
      const onSelectSpec = jest.fn();
      render(<FavoriteItem type="spec" item={baseSpec} onSelectSpec={onSelectSpec} />);
      fireEvent.keyDown(screen.getByTestId('favorite-item'), { key: 'Enter' });
      expect(onSelectSpec).toHaveBeenCalledWith(baseSpec);
    });

    it('activates on Space key', () => {
      const onSelectSpec = jest.fn();
      render(<FavoriteItem type="spec" item={baseSpec} onSelectSpec={onSelectSpec} />);
      fireEvent.keyDown(screen.getByTestId('favorite-item'), { key: ' ' });
      expect(onSelectSpec).toHaveBeenCalledWith(baseSpec);
    });
  });
});
