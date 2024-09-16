const { logger } = require('~/config');
// const { Categories } = require('./schema/categories');
const options = [
  {
    label: '',
    value: '',
  },
  {
    label: 'idea',
    value: 'idea',
  },
  {
    label: 'travel',
    value: 'travel',
  },
  {
    label: 'teach_or_explain',
    value: 'teach_or_explain',
  },
  {
    label: 'write',
    value: 'write',
  },
  {
    label: 'shop',
    value: 'shop',
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
    label: 'roleplay',
    value: 'roleplay',
  },
  {
    label: 'finance',
    value: 'finance',
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
