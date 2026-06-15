const { updateLocationController } = require('./LocationController');

jest.mock('~/models', () => ({
  updateUserLocation: jest.fn(),
}));
const { updateUserLocation } = require('~/models');

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('updateLocationController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-boolean enabled', async () => {
    const res = makeRes();
    await updateLocationController({ user: { id: 'u1' }, body: { enabled: 'yes' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateUserLocation).not.toHaveBeenCalled();
  });

  it('persists a valid payload with rounded coordinates', async () => {
    updateUserLocation.mockResolvedValue({
      personalization: { location: { enabled: true } },
    });
    const res = makeRes();
    await updateLocationController(
      {
        user: { id: 'u1' },
        body: {
          enabled: true,
          source: 'auto',
          place: 'Paris, France',
          coordinates: { latitude: 48.8566, longitude: 2.3522 },
          timezone: 'Europe/Paris',
        },
      },
      res,
    );
    expect(updateUserLocation).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        enabled: true,
        coordinates: { latitude: 48.86, longitude: 2.35 },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ updated: true }));
  });

  it('returns 404 when the user is missing', async () => {
    updateUserLocation.mockResolvedValue(null);
    const res = makeRes();
    await updateLocationController({ user: { id: 'u1' }, body: { enabled: false } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
