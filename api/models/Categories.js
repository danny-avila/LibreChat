const { logger } = require('~/config');
// const { Categories } = require('./schema/categories');

const options = [
  {
    label: 'idea',
    value: 'com_ui_idea',
  },
  {
    label: 'travel',
    value: 'com_ui_travel',
  },
  {
    label: 'teach_or_explain',
    value: 'com_ui_teach_or_explain',
  },
  {
    label: 'write',
    value: 'com_ui_write',
  },
  {
    label: 'shop',
    value: 'com_ui_shop',
  },
  {
    label: 'code',
    value: 'com_ui_code',
  },
  {
    label: 'misc',
    value: 'com_ui_misc',
  },
  {
    label: 'roleplay',
    value: 'com_ui_roleplay',
  },
  {
    label: 'finance',
    value: 'com_ui_finance',
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
