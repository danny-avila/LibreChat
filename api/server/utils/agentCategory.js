const { logger } = require('@librechat/data-schemas');

function capitalizeFirstLetter(val) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

async function syncCategories(customCategoriesList, disableDefaultCategories) {
  logger.info('Syncing custom agent categories...');
  // Import
  const { getAllCategories, createCategory, updateCategory, deleteCategory } = require('~/models');

  let currentOrder = 0;
  // Get all categories from DB
  const dbCategories = await getAllCategories();
  logger.info(`Found ${dbCategories.length} categories in the database.`);

  const isActive = !disableDefaultCategories;
  logger.info(
    `${isActive ? 'Enabling' : 'Disabling'} default agent categories as per configuration.`,
  );
  for (const cat of dbCategories.filter((c) => !c.custom)) {
    logger.info(`${isActive ? 'Enabling' : 'Disabling'} category: ${cat.value}`);
    await updateCategory(cat.value, { isActive });
  }

  // Determine order for new custom categories
  const defaultCategoriesInDb = dbCategories.filter((cat) => !cat.custom);
  if (defaultCategoriesInDb.length > 0) {
    const maxOrder = Math.max(...defaultCategoriesInDb.map((cat) => cat.order || 0));
    currentOrder = maxOrder + 1;
  }
  logger.info(`Current order for new custom categories starts at ${currentOrder}.`);

  // Inject order to custom categories
  logger.info('Assigning order to custom categories.');
  customCategoriesList = customCategoriesList.map((cat, index) => ({
    ...cat,
    order: currentOrder + index,
  }));

  // Delete custom categories not in the config file
  const customCategoryValues = customCategoriesList.map((cat) => cat.value.toLowerCase());
  const categoriesToDelete = dbCategories.filter(
    (cat) => cat.custom && !customCategoryValues.includes(cat.value),
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
        label: capitalizeFirstLetter(category.value || 'Unnamed'),
        description: capitalizeFirstLetter(category.description || ''),
        isActive: true,
        custom: true,
        order: category.order,
      };
    } catch (error) {
      logger.error('Error formatting category: ', category, error);
      continue;
    }

    // Check if category exists by value
    const existing = dbCategories.find((cat) => cat.value === formattedCategory.value);
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
