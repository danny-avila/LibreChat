const { updateUser, getUserById } = require('~/models');

const MAX_FAVORITES = 50;
const MAX_STRING_LENGTH = 256;

const updateFavoritesController = async (req, res) => {
  try {
    const { favorites } = req.body;
    const userId = req.user.id;

    if (!favorites) {
      return res.status(400).json({ message: 'Favorites data is required' });
    }

    if (!Array.isArray(favorites)) {
      return res.status(400).json({ message: 'Favorites must be an array' });
    }

    if (favorites.length > MAX_FAVORITES) {
      return res.status(400).json({
        code: 'MAX_FAVORITES_EXCEEDED',
        message: `Maximum ${MAX_FAVORITES} favorites allowed`,
        limit: MAX_FAVORITES,
      });
    }

    for (const fav of favorites) {
      const hasAgent = !!fav.agentId;
      const hasModel = !!(fav.model && fav.endpoint);

      if (fav.agentId && fav.agentId.length > MAX_STRING_LENGTH) {
        return res
          .status(400)
          .json({ message: `agentId exceeds maximum length of ${MAX_STRING_LENGTH}` });
      }
      if (fav.model && fav.model.length > MAX_STRING_LENGTH) {
        return res
          .status(400)
          .json({ message: `model exceeds maximum length of ${MAX_STRING_LENGTH}` });
      }
      if (fav.endpoint && fav.endpoint.length > MAX_STRING_LENGTH) {
        return res
          .status(400)
          .json({ message: `endpoint exceeds maximum length of ${MAX_STRING_LENGTH}` });
      }

      if (!hasAgent && !hasModel) {
        return res.status(400).json({
          message: 'Each favorite must have either agentId or model+endpoint',
        });
      }

      if (hasAgent && hasModel) {
        return res.status(400).json({
          message: 'Favorite cannot have both agentId and model/endpoint',
        });
      }
    }

    const user = await updateUser(userId, { favorites });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user.favorites);
  } catch (error) {
    console.error('Error updating favorites:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getFavoritesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getUserById(userId, 'favorites');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let favorites = user.favorites || [];

    if (!Array.isArray(favorites)) {
      favorites = [];
      await updateUser(userId, { favorites: [] });
    }

    res.status(200).json(favorites);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  updateFavoritesController,
  getFavoritesController,
};
