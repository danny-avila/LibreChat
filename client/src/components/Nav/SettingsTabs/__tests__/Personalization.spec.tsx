import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import * as memoriesQueries from '~/data-provider/Memories/queries';
import * as locationQueries from '~/data-provider/Location/queries';
import * as authQueries from '~/data-provider/Auth/queries';
import Personalization from '../Personalization';

const mockMutate = jest.fn();

beforeEach(() => {
  mockMutate.mockClear();

  jest
    .spyOn(authQueries, 'useGetUserQuery')
    // @ts-expect-error partial mock
    .mockReturnValue({ data: { personalization: {} } });

  jest
    .spyOn(endpointQueries, 'useGetStartupConfig')
    // @ts-expect-error partial mock
    .mockReturnValue({ data: { location: { enabled: true } } });

  jest
    .spyOn(memoriesQueries, 'useUpdateMemoryPreferencesMutation')
    // @ts-expect-error partial mock
    .mockReturnValue({ mutate: jest.fn(), isLoading: false });

  jest
    .spyOn(locationQueries, 'useUpdateUserLocationMutation')
    // @ts-expect-error partial mock
    .mockReturnValue({ mutate: mockMutate, isLoading: false });

  // @ts-expect-error test stub
  global.navigator.geolocation = {
    getCurrentPosition: (success: PositionCallback) =>
      success({ coords: { latitude: 48.85, longitude: 2.35 } } as GeolocationPosition),
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Personalization location section', () => {
  it('renders the location toggle and manual field when enabled', () => {
    render(
      <Personalization hasMemoryOptOut={false} hasLocationSharing hasAnyPersonalizationFeature />,
    );
    expect(screen.getByText('Share my location with agents')).toBeInTheDocument();
    expect(screen.getByLabelText('Set location manually')).toBeInTheDocument();
    expect(screen.getByText('Use my device location')).toBeInTheDocument();
  });

  it('persists a manual location on blur', async () => {
    render(
      <Personalization hasMemoryOptOut={false} hasLocationSharing hasAnyPersonalizationFeature />,
    );
    const input = screen.getByLabelText('Set location manually');
    fireEvent.change(input, { target: { value: 'Tokyo, Japan' } });
    fireEvent.blur(input);
    await waitFor(() => expect(mockMutate).toHaveBeenCalled());
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ manual: 'Tokyo, Japan', source: 'manual' }),
    );
  });
});
