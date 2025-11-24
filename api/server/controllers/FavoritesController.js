const { User } = require('~/db/models');

const updateFavoritesController = async (req, res) => {
  try {
    const { favorites } = req.body;
    const userId = req.user.id;

    if (!favorites) {
      return res.status(400).json({ message: 'Favorites data is required' });
    }

    // Validate favorites structure
    if (!Array.isArray(favorites)) {
      return res.status(400).json({ message: 'Favorites must be an array' });
    }

    for (const fav of favorites) {
      const hasAgent = !!fav.agentId;
      const hasModel = !!(fav.model && fav.endpoint);

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

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { favorites } },
      { new: true, select: 'favorites' },
    );

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
    const user = await User.findById(userId).select('favorites').lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let favorites = user.favorites || [];

    if (!Array.isArray(favorites)) {
      favorites = [];
      await User.findByIdAndUpdate(userId, { $set: { favorites: [] } });
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
