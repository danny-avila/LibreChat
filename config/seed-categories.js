const connectDb = require('../api/lib/db/connectDb');
const AgentCategory = require('../api/models/AgentCategory');

// Define category constants directly since the constants file was removed
const CATEGORY_VALUES = {
  GENERAL: 'general',
  HR: 'hr',
  RD: 'rd',
  FINANCE: 'finance',
  IT: 'it',
  SALES: 'sales',
  AFTERSALES: 'aftersales',
};

const CATEGORY_DESCRIPTIONS = {
  general: 'General purpose agents for common tasks and inquiries',
  hr: 'Agents specialized in HR processes, policies, and employee support',
  rd: 'Agents focused on R&D processes, innovation, and technical research',
  finance: 'Agents specialized in financial analysis, budgeting, and accounting',
  it: 'Agents for IT support, technical troubleshooting, and system administration',
  sales: 'Agents focused on sales processes, customer relations, and marketing',
  aftersales: 'Agents specialized in post-sale support, maintenance, and customer service',
};

/**
 * Seed agent categories from existing constants into MongoDB
 * This migration creates the initial category data in the database
 */
async function seedCategories() {
  try {
    await connectDb();
    console.log('Connected to database');

    // Prepare category data from existing constants
    const categoryData = [
      {
        value: CATEGORY_VALUES.GENERAL,
        label: 'General',
        description: CATEGORY_DESCRIPTIONS.general,
        order: 0,
      },
      {
        value: CATEGORY_VALUES.HR,
        label: 'Human Resources',
        description: CATEGORY_DESCRIPTIONS.hr,
        order: 1,
      },
      {
        value: CATEGORY_VALUES.RD,
        label: 'Research & Development',
        description: CATEGORY_DESCRIPTIONS.rd,
        order: 2,
      },
      {
        value: CATEGORY_VALUES.FINANCE,
        label: 'Finance',
        description: CATEGORY_DESCRIPTIONS.finance,
        order: 3,
      },
      {
        value: CATEGORY_VALUES.IT,
        label: 'Information Technology',
        description: CATEGORY_DESCRIPTIONS.it,
        order: 4,
      },
      {
        value: CATEGORY_VALUES.SALES,
        label: 'Sales & Marketing',
        description: CATEGORY_DESCRIPTIONS.sales,
        order: 5,
      },
      {
        value: CATEGORY_VALUES.AFTERSALES,
        label: 'After Sales',
        description: CATEGORY_DESCRIPTIONS.aftersales,
        order: 6,
      },
    ];

    console.log('Seeding categories...');
    const result = await AgentCategory.seedCategories(categoryData);

    console.log(`Successfully seeded ${result.upsertedCount} new categories`);
    console.log(`Modified ${result.modifiedCount} existing categories`);

    // Verify the seeded data
    const categories = await AgentCategory.getActiveCategories();
    console.log('Active categories in database:');
    categories.forEach((cat) => {
      console.log(`  - ${cat.value}: ${cat.label} (order: ${cat.order})`);
    });

    console.log('Category seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedCategories();
}

module.exports = seedCategories;
