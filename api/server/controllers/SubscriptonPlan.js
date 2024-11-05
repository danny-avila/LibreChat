const SubscriptionPlan = require('~/models/SubscriptionPlan');

// Fetch all active subscription plans
async function getSubscriptionPlans(req, res) {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).lean();
    res.status(200).json(plans);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving subscription plans', error });
  }
}

// Fetch a specific subscription plan by ID
async function getSubscriptionPlanById(req, res) {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findById(id).lean();
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }
    res.status(200).json(plan);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving the subscription plan', error });
  }
}

// Create a new subscription plan
async function createSubscriptionPlan(req, res) {
  try {
    const { name, description, price, durationInDays, tokenCredits } = req.body;
    const newPlan = new SubscriptionPlan({
      name,
      description,
      price,
      durationInDays,
      tokenCredits,
    });
    await newPlan.save();
    res.status(201).json(newPlan);
  } catch (error) {
    res.status(500).json({ message: 'Error creating subscription plan', error });
  }
}

// Update an existing subscription plan
async function updateSubscriptionPlan(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const plan = await SubscriptionPlan.findByIdAndUpdate(id, updates, { new: true });
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }
    res.status(200).json(plan);
  } catch (error) {
    res.status(500).json({ message: 'Error updating subscription plan', error });
  }
}

// Delete a subscription plan
async function deleteSubscriptionPlan(req, res) {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }
    res.status(200).json({ message: 'Subscription plan deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting subscription plan', error });
  }
}

const paymentService = require('~/server/services/paymentService'); // Import the payment service

// Buy a subscription plan
async function buySubscriptionPlan(req, res) {
  try {
    const { id } = req.params; // Subscription plan ID from request parameters
    const userId = req.user.id; // Assuming user info is available in `req.user`

    // Find the subscription plan by ID
    const plan = await SubscriptionPlan.findById(id).lean();
    if (!plan) {
      return res.status(404).json({ message: 'Subscription plan not found' });
    }

    // Initiate payment using paymentService
    const paymentResponse = await paymentService.initiatePayment({
      userId,
      amount: plan.price,
      description: `Purchase of subscription plan: ${plan.name}`,
      metadata: { planId: id, userId }, // Optional metadata,
      callbackUrl: process.env.ZARINPAL_CALL_BACK_URL,
    });

    // Return the payment initiation details (e.g., payment URL or transaction ID)
    res.status(200).json(paymentResponse);
  } catch (error) {
    res.status(500).json({ message: 'Error processing the payment', error });
  }
}

module.exports = {
  getSubscriptionPlans,
  getSubscriptionPlanById,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  buySubscriptionPlan, // Export the buy controller
};

