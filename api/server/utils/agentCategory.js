const { logger } = require('@librechat/data-schemas');

function normalizeValue(raw) {
  return (raw ?? '').toString().trim().toLowerCase();
}

/**
 * Synchronizes agent categories with the database.
 * @param {Array|undefined} customCategoriesList - Custom categories from config. When `undefined`, custom categories are left untouched (only defaults are toggled). An explicit empty array opts in to deleting all existing custom categories.
 * @param {boolean} enableDefaultCategories - Whether default categories should be active.
 */
async function syncCategories(customCategoriesList, enableDefaultCategories) {
  const { getAllCategories, createCategory, updateCategory, deleteCategory } = require('~/models');
  logger.info('Syncing custom agent categories...');

  const dbCategories = await getAllCategories();
  logger.info(`Found ${dbCategories.length} categories in the database.`);

  logger.info(
    `${enableDefaultCategories ? 'Enabling' : 'Disabling'} default agent categories as per configuration.`,
  );
  for (const cat of dbCategories.filter((c) => !c.custom)) {
    logger.info(`${enableDefaultCategories ? 'Enabling' : 'Disabling'} category: ${cat.value}`);
    await updateCategory(cat.value, { isActive: enableDefaultCategories });
  }

  if (!Array.isArray(customCategoriesList)) {
    logger.info(
      'No custom categories list provided; leaving existing custom categories untouched.',
    );
    return;
  }

  const defaultCategoriesInDb = dbCategories.filter((cat) => !cat.custom);
  const initialOrder =
    defaultCategoriesInDb.reduce((max, cat) => Math.max(max, cat.order || 0), 0) + 1;
  logger.info(`Current order for new custom categories starts at ${initialOrder}.`);

  const preparedCategories = customCategoriesList.reduce((acc, cat, index) => {
    const normalizedValue = normalizeValue(cat?.value);
    if (!normalizedValue) {
      logger.warn(
        `Skipping invalid custom category entry at index ${index}: missing or empty value.`,
      );
      return acc;
    }
    acc.push({
      normalizedValue,
      label: cat.value.toString().trim(),
      description: typeof cat.description === 'string' ? cat.description : '',
      order: initialOrder + acc.length,
    });
    return acc;
  }, []);

  const configuredValues = new Set(preparedCategories.map((c) => c.normalizedValue));
  const categoriesToDelete = dbCategories.filter(
    (cat) => cat.custom && !configuredValues.has(normalizeValue(cat.value)),
  );
  for (const cat of categoriesToDelete) {
    logger.info(`Deleting custom category not in config: ${cat.value}`);
    await deleteCategory(cat.value);
  }

  for (const prepared of preparedCategories) {
    const existing = dbCategories.find(
      (cat) => normalizeValue(cat.value) === prepared.normalizedValue,
    );

    if (existing && existing.custom === false) {
      logger.warn(
        `Skipping custom category '${prepared.label}': value collides with an existing default category.`,
      );
      continue;
    }

    const formattedCategory = {
      value: prepared.normalizedValue,
      label: prepared.label,
      description: prepared.description,
      isActive: true,
      custom: true,
      order: prepared.order,
    };

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
