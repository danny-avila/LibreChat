const { logger } = require('~/config');
// const { Categories } = require('./schema/categories');
const options = [
  {
    label: '',
    value: '',
  },
  {
    label: 'operations',
    value: 'operations',
  },
  {
    label: 'marketing',
    value: 'marketing',
  },
  {
    label: 'techops',
    value: 'techops',
  },
  {
    label: 'commercial',
    value: 'commercial',
  },
  {
    label: 'finance',
    value: 'finance',
  },
  {
    label: 'code',
    value: 'code',
  },
  {
    label: 'misc',
    value: 'misc',
  },
  {
    label: 'product',
    value: 'product',
  },
  {
    label: 'people_ops',
    value: 'people_ops',
  },
];

module.exports = {
  /**
   * Retrieves the categories asynchronously.
   * @returns {Promise<TGetCategoriesResponse>} An array of category objects.
   * @throws {Error} If there is an error retrieving the categories.
   */
  getCategories: async () => {
    try {
      // const categories = await Categories.find();
      return options;
    } catch (error) {
      logger.error('Error getting categories', error);
      return [];
    }
  },
};
