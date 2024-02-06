import { render, screen, fireEvent } from 'test/layout-test-utils';
import PluginStoreDialog from '../PluginStoreDialog';
import userEvent from '@testing-library/user-event';
import * as mockDataProvider from 'librechat-data-provider/react-query';

jest.mock('librechat-data-provider/react-query');

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

const pluginsQueryResult = [
  {
    name: 'Google',
    pluginKey: 'google',
    description: 'Use Google Search to find information',
    icon: 'https://i.imgur.com/SMmVkNB.png',
    authConfig: [
      {
        authField: 'GOOGLE_CSE_ID',
        label: 'Google CSE ID',
        description: 'This is your Google Custom Search Engine ID.',
      },
    ],
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
        description: 'An AppID must be supplied in all calls to the Wolfram|Alpha API.',
      },
    ],
  },
  {
    name: 'Calculator',
    pluginKey: 'calculator',
    description: 'A simple calculator plugin',
    icon: 'https://i.imgur.com/SMmVkNB.png',
    authConfig: [],
  },
  {
    name: 'Plugin 1',
    pluginKey: 'plugin1',
    description: 'description for Plugin 1.',
    icon: 'mock-icon',
    authConfig: [],
  },
  {
    name: 'Plugin 2',
    pluginKey: 'plugin2',
    description: 'description for Plugin 2.',
    icon: 'mock-icon',
    authConfig: [],
  },
  {
    name: 'Plugin 3',
    pluginKey: 'plugin3',
    description: 'description for Plugin 3.',
    icon: 'mock-icon',
    authConfig: [],
  },
  {
    name: 'Plugin 4',
    pluginKey: 'plugin4',
    description: 'description for Plugin 4.',
    icon: 'mock-icon',
    authConfig: [],
  },
  {
    name: 'Plugin 5',
    pluginKey: 'plugin5',
    description: 'description for Plugin 5.',
    icon: 'mock-icon',
    authConfig: [],
  },
  {
    name: 'Plugin 6',
    pluginKey: 'plugin6',
    description: 'description for Plugin 6.',
    icon: 'mock-icon',
    authConfig: [],
  },
  {
    name: 'Plugin 7',
    pluginKey: 'plugin7',
    description: 'description for Plugin 7.',
    icon: 'mock-icon',
    authConfig: [],
  },
];

const setup = ({
  useGetUserQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {
      plugins: ['wolfram'],
    },
  },
  useRefreshTokenMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {
      token: 'mock-token',
      user: {},
    },
  },
  useAvailablePluginsQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: pluginsQueryResult,
  },
  useUpdateUserPluginsMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {},
  },
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
  const mockUseRefreshTokenMutation = jest
    .spyOn(mockDataProvider, 'useRefreshTokenMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useRefreshTokenMutationReturnValue);
  const mockSetIsOpen = jest.fn();
  const renderResult = render(<PluginStoreDialog isOpen={true} setIsOpen={mockSetIsOpen} />);

  return {
    ...renderResult,
    mockUseGetUserQuery,
    mockUseAvailablePluginsQuery,
    mockUseUpdateUserPluginsMutation,
    mockUseRefreshTokenMutation,
    mockSetIsOpen,
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

test('allows the user to navigate between pages', async () => {
  const { getByRole, getByText } = setup();

  expect(getByText('Google')).toBeInTheDocument();
  expect(getByText('Wolfram')).toBeInTheDocument();
  expect(getByText('Plugin 1')).toBeInTheDocument();

  const nextPageButton = getByRole('button', { name: 'Next page' });
  await userEvent.click(nextPageButton);

  expect(getByText('Plugin 6')).toBeInTheDocument();
  expect(getByText('Plugin 7')).toBeInTheDocument();
  // expect(getByText('Plugin 3')).toBeInTheDocument();
  // expect(getByText('Plugin 4')).toBeInTheDocument();
  // expect(getByText('Plugin 5')).toBeInTheDocument();

  const previousPageButton = getByRole('button', { name: 'Previous page' });
  await userEvent.click(previousPageButton);

  expect(getByText('Google')).toBeInTheDocument();
  expect(getByText('Wolfram')).toBeInTheDocument();
  expect(getByText('Plugin 1')).toBeInTheDocument();
});

test('allows the user to search for plugins', async () => {
  setup();

  const searchInput = screen.getByPlaceholderText('Search plugins');
  fireEvent.change(searchInput, { target: { value: 'Google' } });

  expect(screen.getByText('Google')).toBeInTheDocument();
  expect(screen.queryByText('Wolfram')).not.toBeInTheDocument();
  expect(screen.queryByText('Plugin 1')).not.toBeInTheDocument();

  fireEvent.change(searchInput, { target: { value: 'Plugin 1' } });

  expect(screen.getByText('Plugin 1')).toBeInTheDocument();
  expect(screen.queryByText('Google')).not.toBeInTheDocument();
  expect(screen.queryByText('Wolfram')).not.toBeInTheDocument();
});
