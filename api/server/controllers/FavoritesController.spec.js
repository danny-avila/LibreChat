jest.mock('~/models', () => ({
  updateUser: jest.fn(),
  getUserById: jest.fn(),
}));

const { updateUser, getUserById } = require('~/models');
const { updateFavoritesController, getFavoritesController } = require('./FavoritesController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = (body = {}) => ({
  body,
  user: { id: 'user-123' },
});

describe('FavoritesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateFavoritesController - payload envelope', () => {
    it('rejects missing favorites key with 400', async () => {
      const req = makeReq({});
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Favorites data is required' });
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('rejects non-array favorites with 400', async () => {
      const req = makeReq({ favorites: 'not-an-array' });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Favorites must be an array' });
    });

    it('rejects favorites over MAX_FAVORITES with 400 + code', async () => {
      const favorites = Array.from({ length: 51 }, (_, i) => ({ agentId: `agent-${i}` }));
      const req = makeReq({ favorites });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: 'MAX_FAVORITES_EXCEEDED',
        message: 'Maximum 50 favorites allowed',
        limit: 50,
      });
    });
  });

  describe('updateFavoritesController - agent/model length validation', () => {
    it('rejects oversized agentId', async () => {
      const req = makeReq({ favorites: [{ agentId: 'a'.repeat(257) }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'agentId exceeds maximum length of 256' });
    });

    it('rejects oversized model', async () => {
      const req = makeReq({ favorites: [{ model: 'm'.repeat(257), endpoint: 'openai' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'model exceeds maximum length of 256' });
    });
  });

  describe('updateFavoritesController - spec validation', () => {
    it('accepts a valid spec favorite', async () => {
      updateUser.mockResolvedValue({ favorites: [{ spec: 'my-spec' }] });
      const req = makeReq({ favorites: [{ spec: 'my-spec' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([{ spec: 'my-spec' }]);
      expect(updateUser).toHaveBeenCalledWith('user-123', {
        favorites: [{ spec: 'my-spec' }],
      });
    });

    it('rejects non-string spec with 400', async () => {
      const req = makeReq({ favorites: [{ spec: 42 }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'spec must be a non-empty string' });
    });

    it('rejects empty string spec with 400', async () => {
      const req = makeReq({ favorites: [{ spec: '' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'spec must be a non-empty string' });
    });

    it('rejects oversized spec with 400', async () => {
      const req = makeReq({ favorites: [{ spec: 's'.repeat(257) }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'spec exceeds maximum length of 256' });
    });

    it('allows undefined/null spec (treated as absent)', async () => {
      updateUser.mockResolvedValue({ favorites: [{ agentId: 'a1' }] });
      const req = makeReq({ favorites: [{ agentId: 'a1', spec: null }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateFavoritesController - exclusivity (typeCount)', () => {
    it('rejects empty favorite entry with 400', async () => {
      const req = makeReq({ favorites: [{}] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Each favorite must have either agentId, model+endpoint, or spec',
      });
    });

    it('rejects agentId + model combination', async () => {
      const req = makeReq({
        favorites: [{ agentId: 'a1', model: 'gpt-5', endpoint: 'openai' }],
      });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Favorite cannot have multiple types (agentId, model/endpoint, or spec)',
      });
    });

    it('rejects agentId + spec combination', async () => {
      const req = makeReq({ favorites: [{ agentId: 'a1', spec: 's1' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Favorite cannot have multiple types (agentId, model/endpoint, or spec)',
      });
    });

    it('rejects model + spec combination', async () => {
      const req = makeReq({
        favorites: [{ model: 'gpt-5', endpoint: 'openai', spec: 's1' }],
      });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects spec with stray endpoint field', async () => {
      const req = makeReq({ favorites: [{ spec: 's1', endpoint: 'openai' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'spec cannot be combined with agentId, model, or endpoint',
      });
    });

    it('rejects spec with stray model field', async () => {
      const req = makeReq({ favorites: [{ spec: 's1', model: 'gpt-5' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'spec cannot be combined with agentId, model, or endpoint',
      });
    });

    it('rejects agentId with stray model field (no endpoint)', async () => {
      const req = makeReq({ favorites: [{ agentId: 'a1', model: 'gpt-5' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'agentId cannot be combined with model or endpoint',
      });
    });

    it('rejects agentId with stray endpoint field (no model)', async () => {
      const req = makeReq({ favorites: [{ agentId: 'a1', endpoint: 'openai' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'agentId cannot be combined with model or endpoint',
      });
    });

    it('rejects model without endpoint (partial model pair)', async () => {
      const req = makeReq({ favorites: [{ model: 'gpt-5' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'model and endpoint must be provided together',
      });
    });

    it('rejects endpoint without model (partial model pair)', async () => {
      const req = makeReq({ favorites: [{ endpoint: 'openai' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'model and endpoint must be provided together',
      });
    });

    it('accepts a mixed array of valid single-type favorites', async () => {
      const favorites = [{ agentId: 'a1' }, { model: 'gpt-5', endpoint: 'openai' }, { spec: 's1' }];
      updateUser.mockResolvedValue({ favorites });
      const req = makeReq({ favorites });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(favorites);
    });
  });

  describe('updateFavoritesController - persistence', () => {
    it('returns 404 when user is not found', async () => {
      updateUser.mockResolvedValue(null);
      const req = makeReq({ favorites: [{ spec: 's1' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    it('returns 500 when updateUser throws', async () => {
      updateUser.mockRejectedValue(new Error('db down'));
      const req = makeReq({ favorites: [{ spec: 's1' }] });
      const res = makeRes();
      await updateFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    });
  });

  describe('getFavoritesController', () => {
    it('returns the user favorites array', async () => {
      const favorites = [{ agentId: 'a1' }, { spec: 's1' }];
      getUserById.mockResolvedValue({ favorites });
      const req = makeReq();
      const res = makeRes();
      await getFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(favorites);
    });

    it('returns [] when user.favorites is null (falsy)', async () => {
      getUserById.mockResolvedValue({ favorites: null });
      const req = makeReq();
      const res = makeRes();
      await getFavoritesController(req, res);
      expect(updateUser).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('repairs corrupt favorites field (non-array truthy)', async () => {
      getUserById.mockResolvedValue({ favorites: 'corrupt' });
      updateUser.mockResolvedValue({ favorites: [] });
      const req = makeReq();
      const res = makeRes();
      await getFavoritesController(req, res);
      expect(updateUser).toHaveBeenCalledWith('user-123', { favorites: [] });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('returns 404 when user not found', async () => {
      getUserById.mockResolvedValue(null);
      const req = makeReq();
      const res = makeRes();
      await getFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 500 when getUserById throws', async () => {
      getUserById.mockRejectedValue(new Error('db down'));
      const req = makeReq();
      const res = makeRes();
      await getFavoritesController(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
