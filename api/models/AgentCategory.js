const mongoose = require('mongoose');

/**
 * AgentCategory Schema - Dynamic agent category management
 * Focused implementation for core features only
 */
const agentCategorySchema = new mongoose.Schema(
  {
    // Unique identifier for the category (e.g., 'general', 'hr', 'finance')
    value: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    
    // Display label for the category
    label: {
      type: String,
      required: true,
      trim: true,
    },
    
    // Description of the category
    description: {
      type: String,
      trim: true,
      default: '',
    },
    
    // Display order for sorting categories
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    
    // Whether the category is active and should be displayed
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
agentCategorySchema.index({ isActive: 1, order: 1 });

/**
 * Get all active categories sorted by order
 * @returns {Promise<AgentCategory[]>} Array of active categories
 */
agentCategorySchema.statics.getActiveCategories = function() {
  return this.find({ isActive: true })
    .sort({ order: 1, label: 1 })
    .lean();
};

/**
 * Get categories with agent counts
 * @returns {Promise<AgentCategory[]>} Categories with agent counts
 */
agentCategorySchema.statics.getCategoriesWithCounts = async function() {
  const Agent = mongoose.model('agent');
  
  // Aggregate to get agent counts per category
  const categoryCounts = await Agent.aggregate([
    { $match: { category: { $exists: true, $ne: null } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  
  // Create a map for quick lookup
  const countMap = new Map(categoryCounts.map(c => [c._id, c.count]));
  
  // Get all active categories and add counts
  const categories = await this.getActiveCategories();
  
  return categories.map(category => ({
    ...category,
    agentCount: countMap.get(category.value) || 0,
  }));
};

/**
 * Get valid category values for Agent model validation
 * @returns {Promise<string[]>} Array of valid category values
 */
agentCategorySchema.statics.getValidCategoryValues = function() {
  return this.find({ isActive: true })
    .distinct('value')
    .lean();
};

/**
 * Seed initial categories from existing constants
 */
agentCategorySchema.statics.seedCategories = async function(categories) {
  const operations = categories.map((category, index) => ({
    updateOne: {
      filter: { value: category.value },
      update: {
        $setOnInsert: {
          value: category.value,
          label: category.label || category.value,
          description: category.description || '',
          order: category.order || index,
          isActive: true,
        },
      },
      upsert: true,
    },
  }));
  
  return this.bulkWrite(operations);
};

const AgentCategory = mongoose.model('AgentCategory', agentCategorySchema);

module.exports = AgentCategory;