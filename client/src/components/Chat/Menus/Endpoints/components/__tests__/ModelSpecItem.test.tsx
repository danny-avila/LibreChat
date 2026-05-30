import { render, screen, fireEvent } from '@testing-library/react';
import type { TModelSpec } from 'librechat-data-provider';
import { ModelSpecItem } from '../ModelSpecItem';

const mockHandleSelectSpec = jest.fn();
const mockToggleFavoriteSpec = jest.fn();
let mockIsFavoriteSpec = false;
let mockIsActive = false;

jest.mock('~/components/Chat/Menus/Endpoints/ModelSelectorContext', () => ({
  useModelSelectorContext: () => ({
    handleSelectSpec: mockHandleSelectSpec,
    endpointsConfig: {},
  }),
}));

jest.mock('~/components/Chat/Menus/Endpoints/CustomMenu', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    CustomMenuItem: React.forwardRef(function MockMenuItem(
      { children, ...rest }: { children?: React.ReactNode },
      ref: React.Ref<HTMLDivElement>,
    ) {
      return React.createElement('div', { ref, role: 'menuitem', ...rest }, children);
    }),
  };
});

jest.mock('../SpecIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="spec-icon" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFavorites: () => ({
    isFavoriteSpec: () => mockIsFavoriteSpec,
    toggleFavoriteSpec: mockToggleFavoriteSpec,
  }),
  useIsActiveItem: () => ({ ref: { current: null }, isActive: mockIsActive }),
}));

const baseSpec: TModelSpec = {
  name: 'my-spec',
  label: 'My Spec',
  preset: {
    endpoint: 'openai',
    model: 'gpt-5',
  },
};

describe('ModelSpecItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsFavoriteSpec = false;
    mockIsActive = false;
  });

  it('renders the spec label and icon', () => {
    render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
    expect(screen.getByText('My Spec')).toBeInTheDocument();
    expect(screen.getByTestId('spec-icon')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <ModelSpecItem spec={{ ...baseSpec, description: 'Fast and cheap' }} isSelected={false} />,
    );
    expect(screen.getByText('Fast and cheap')).toBeInTheDocument();
  });

  it('renders aria-selected=true when isSelected', () => {
    render(<ModelSpecItem spec={baseSpec} isSelected={true} />);
    expect(screen.getByRole('menuitem')).toHaveAttribute('aria-selected', 'true');
  });

  it('does NOT set aria-selected when not selected', () => {
    render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
    expect(screen.getByRole('menuitem')).not.toHaveAttribute('aria-selected');
  });

  it('calls handleSelectSpec on row click', () => {
    render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
    fireEvent.click(screen.getByRole('menuitem'));
    expect(mockHandleSelectSpec).toHaveBeenCalledWith(baseSpec);
  });

  describe('pin button', () => {
    it('renders Pin icon with "com_ui_pin" label when not favorited', () => {
      mockIsFavoriteSpec = false;
      render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
      expect(screen.getByRole('button', { name: 'com_ui_pin' })).toBeInTheDocument();
    });

    it('renders PinOff icon with "com_ui_unpin" label when favorited', () => {
      mockIsFavoriteSpec = true;
      render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
      expect(screen.getByRole('button', { name: 'com_ui_unpin' })).toBeInTheDocument();
    });

    it('calls toggleFavoriteSpec with spec.name on click', () => {
      render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_pin' }));
      expect(mockToggleFavoriteSpec).toHaveBeenCalledWith('my-spec');
    });

    it('stops propagation so handleSelectSpec is not fired', () => {
      render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_pin' }));
      expect(mockHandleSelectSpec).not.toHaveBeenCalled();
    });

    it('has tabIndex=-1 when item is not active', () => {
      mockIsActive = false;
      render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
      expect(screen.getByRole('button', { name: 'com_ui_pin' })).toHaveAttribute('tabindex', '-1');
    });

    it('has tabIndex=0 when item is active', () => {
      mockIsActive = true;
      render(<ModelSpecItem spec={baseSpec} isSelected={false} />);
      expect(screen.getByRole('button', { name: 'com_ui_pin' })).toHaveAttribute('tabindex', '0');
    });
  });
});
