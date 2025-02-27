const { logger } = require('~/config');
// const { Categories } = require('./schema/categories');
/*
  {
    label: 'com_ui_idea',
    value: 'idea',
  },
  {
    label: 'com_ui_travel',
    value: 'travel',
  },
  {
    label: 'com_ui_teach_or_explain',
    value: 'teach_or_explain',
  },
  {
    label: 'com_ui_write',
    value: 'write',
  },
  {
    label: 'com_ui_shop',
    value: 'shop',
  },
  {
    label: 'com_ui_code',
    value: 'code',
  },
  {
    label: 'com_ui_misc',
    value: 'misc',
  },
  {
    label: 'com_ui_roleplay',
    value: 'roleplay',
  },
  {
    label: 'com_ui_finance',
    value: 'finance',
  },
*/
const options = [
  {
    label: 'customer_clerk',
    value: 'customer_clerk',
  },
  {
    label: 'contract_clerk',
    value: 'contract_clerk',
  },
  {
    label: 'damage_clerk',
    value: 'damage_clerk',
  },
  {
    label: 'salesperson',
    value: 'salesperson',
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
