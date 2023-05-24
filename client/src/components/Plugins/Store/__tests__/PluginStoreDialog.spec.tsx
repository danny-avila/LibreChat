import { render, screen, waitFor } from 'layout-test-utils';
import PluginStoreDialog from '../PluginStoreDialog';
import userEvent from '@testing-library/user-event';
import * as mockDataProvider from '~/data-provider';

jest.mock('~/data-provider');

class ResizeObserver {
  observe() {
    // do nothing
  }
  unobserve() {
    // do nothing
  }
  disconnect() {
    // do nothing
  }
}

window.ResizeObserver = ResizeObserver;

const setup = ({
  useGetUserQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {
      plugins: ['wolfram']
    }
  },
  useAvailablePluginsQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: [
      {
        name: 'Google',
        pluginKey: 'google',
        description: 'Use Google Search to find information',
        icon: 'https://i.imgur.com/SMmVkNB.png',
        authConfig: [
          {
            authField: 'GOOGLE_CSE_ID',
            label: 'Google CSE ID',
            description: 'This is your Google Custom Search Engine ID.'
          }
        ]
      },
      {
        name: 'Wolfram',
        pluginKey: 'wolfram',
        description:
          'Access computation, math, curated knowledge & real-time data through Wolfram|Alpha and Wolfram Language.',
        icon: 'https://www.wolframcdn.com/images/icons/Wolfram.png',
        authConfig: [
          {
            authField: 'WOLFRAM_APP_ID',
            label: 'Wolfram App ID',
            description: 'An AppID must be supplied in all calls to the Wolfram|Alpha API.'
          }
        ]
      },
      {
        name: 'Calculator',
        pluginKey: 'calculator',
        description: 'A simple calculator plugin',
        icon: 'https://i.imgur.com/SMmVkNB.png',
        authConfig: []
      }
    ]
  },
  useUpdateUserPluginsMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {}
  }
} = {}) => {
  const mockUseAvailablePluginsQuery = jest
    .spyOn(mockDataProvider, 'useAvailablePluginsQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useAvailablePluginsQueryReturnValue);
  const mockUseUpdateUserPluginsMutation = jest
    .spyOn(mockDataProvider, 'useUpdateUserPluginsMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useUpdateUserPluginsMutationReturnValue);
  const mockUseGetUserQuery = jest
    .spyOn(mockDataProvider, 'useGetUserQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetUserQueryReturnValue);
  const mockSetIsOpen = jest.fn();
  const renderResult = render(<PluginStoreDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

  return {
    ...renderResult,
    mockUseGetUserQuery,
    mockUseAvailablePluginsQuery,
    mockUseUpdateUserPluginsMutation,
    mockSetIsOpen
  };
};

test('renders plugin store dialog with plugins from the available plugins query and shows install/uninstall buttons based on user plugins', () => {
  const { getByText, getByRole } = setup();
  expect(getByText(/Plugin Store/i)).toBeInTheDocument();
  expect(getByText(/Use Google Search to find information/i)).toBeInTheDocument();
  expect(getByRole('button', { name: 'Install Google' })).toBeInTheDocument();
  expect(getByRole('button', { name: 'Uninstall Wolfram' })).toBeInTheDocument();
});

test('Displays the plugin auth form when installing a plugin with auth', async () => {
  const { getByRole, getByText } = setup();
  const googleButton = getByRole('button', { name: 'Install Google' });
  await userEvent.click(googleButton);
  expect(getByText(/Google CSE ID/i)).toBeInTheDocument();
  expect(getByRole('button', { name: 'Save' })).toBeInTheDocument();
});
