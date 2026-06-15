import { render, screen, fireEvent, waitFor } from 'test/layout-test-utils';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import * as memoriesQueries from '~/data-provider/Memories/queries';
import * as locationQueries from '~/data-provider/Location/queries';
import * as authQueries from '~/data-provider/Auth/queries';
import Personalization from '../Personalization';

const mockMutate = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

beforeEach(() => {
  mockMutate.mockClear();
  mockShowToast.mockClear();

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

  it('shows a warning toast when geolocation is denied and does not call mutate with auto source', async () => {
    const deniedError = Object.assign(new Error('denied'), {
      code: 1,
      PERMISSION_DENIED: 1,
    });
    jest
      .spyOn(global.navigator.geolocation, 'getCurrentPosition')
      .mockImplementation((_success, error) => error?.(deniedError as GeolocationPositionError));

    render(
      <Personalization hasMemoryOptOut={false} hasLocationSharing hasAnyPersonalizationFeature />,
    );

    const button = screen.getByText('Use my device location');
    fireEvent.click(button);

    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));

    expect(mockMutate).not.toHaveBeenCalledWith(expect.objectContaining({ source: 'auto' }));

    expect(screen.getByLabelText('Set location manually')).toBeInTheDocument();
  });
});
