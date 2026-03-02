const { logger } = require('@librechat/data-schemas');

/**
 * Synchronizes custom agent categories with the database.
 * @param {Array} customCategoriesList - List of custom categories to be synchronized.
 * @param {boolean} enableDefaultCategories - Flag indicating whether to enable default categories.
 */
async function syncCategories(customCategoriesList, enableDefaultCategories) {
  const { getAllCategories, createCategory, updateCategory, deleteCategory } = require('~/models');
  logger.info('Syncing custom agent categories...');

  // Get all categories from DB
  const dbCategories = await getAllCategories();
  logger.info(`Found ${dbCategories.length} categories in the database.`);

  logger.info(
    `${enableDefaultCategories ? 'Enabling' : 'Disabling'} default agent categories as per configuration.`,
  );
  for (const cat of dbCategories.filter((c) => !c.custom)) {
    logger.info(`${enableDefaultCategories ? 'Enabling' : 'Disabling'} category: ${cat.value}`);
    await updateCategory(cat.value, { isActive: enableDefaultCategories });
  }

  // Initial order takes the max value of existing default categories + 1
  const defaultCategoriesInDb = dbCategories.filter((cat) => !cat.custom);
  const initialOrder =
    defaultCategoriesInDb.reduce((max, cat) => Math.max(max, cat.order || 0), 0) + 1;
  logger.info(`Current order for new custom categories starts at ${initialOrder}.`);

  // Inject order to custom categories
  logger.info('Assigning order to custom categories.');
  customCategoriesList = customCategoriesList.map((cat, index) => ({
    ...cat,
    order: initialOrder + index,
  }));

  // Delete custom categories not in the config file
  const customCategoryValues = new Set(customCategoriesList.map((cat) => cat.value.toLowerCase()));
  const categoriesToDelete = dbCategories.filter(
    (cat) => cat.custom && !customCategoryValues.has(cat.value.toLowerCase()),
  );
  for (const cat of categoriesToDelete) {
    logger.info(`Deleting custom category not in config: ${cat.value}`);
    await deleteCategory(cat.value);
  }

  // Sync custom categories
  for (const category of customCategoriesList) {
    let formattedCategory;
    try {
      formattedCategory = {
        value: category.value.toLowerCase() || 'unnamed',
        label: category.value || 'Unnamed',
        description: category.description || '',
        isActive: true,
        custom: true,
        order: category.order,
      };
    } catch (error) {
      logger.error('Error formatting category: ', category, error);
      continue;
    }

    // Check if category exists by value
    const existing = dbCategories.find(
      (cat) => cat.value.toLowerCase() === formattedCategory.value,
    );
    if (existing) {
      logger.info(`Updating category: ${formattedCategory.value}`);
      await updateCategory(existing.value, formattedCategory);
    } else {
      logger.info(`Creating category: ${formattedCategory.value}`);
      await createCategory(formattedCategory);
    }
  }

  logger.info('Custom categories synchronized successfully.');
}

module.exports = {
  syncCategories,
};
