const { User } = require('~/db/models');

const updateFavoritesController = async (req, res) => {
  try {
    const { favorites } = req.body;
    const userId = req.user.id;

    if (!favorites) {
      return res.status(400).json({ message: 'Favorites data is required' });
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

    // Ensure favorites is an array (migration/dev fix)
    if (!Array.isArray(favorites)) {
      favorites = [];
      // Optionally update the DB to fix it permanently
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
