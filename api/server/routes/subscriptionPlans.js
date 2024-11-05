const express = require('express');
const router = express.Router();
const subscriptionPlanController = require('../controllers/SubscriptonPlan');
const { requireJwtAuth } = require('../middleware/');

// Get all subscription plans
router.get('/', requireJwtAuth, subscriptionPlanController.getSubscriptionPlans);

// Get a specific subscription plan by ID
router.get('/:id', requireJwtAuth, subscriptionPlanController.getSubscriptionPlanById);

// Create a new subscription plan
router.post('/', requireJwtAuth, subscriptionPlanController.createSubscriptionPlan);

// Update an existing subscription plan
router.put('/:id', requireJwtAuth, subscriptionPlanController.updateSubscriptionPlan);

// Delete a subscription plan
router.delete('/:id', requireJwtAuth, subscriptionPlanController.deleteSubscriptionPlan);

// Buy a subscription plan
router.post('/buy/:id', requireJwtAuth, subscriptionPlanController.buySubscriptionPlan);

module.exports = router;
