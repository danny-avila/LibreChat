const axios = require('axios');
const { logger } = require('~/config');

// Main controller function
async function omnexioSubscriptionPlans(req, res) {
  try {
    const subscriptionPlans = await fetchAndEnrichSubscriptionPlans(req.user.id);
    return res.status(200).send(subscriptionPlans);
  } catch (error) {
    logger.error('[omnexioSubscriptions] Error fetching plans:', error);
    return res.status(200).send([]);
  }
}

// Fetch all plans and enrich with user's current plan
async function fetchAndEnrichSubscriptionPlans(userId) {
  const allPlans = await fetchAllSubscriptionPlans();
  const currentPlanId = await fetchCurrentSubscriptionPlanId(userId);

  // Add isCurrent field to each plan while preserving original order
  return allPlans.map((plan) => {
    plan.isCurrent = plan.id === currentPlanId;
    return plan;
  });
}

// Fetch all available subscription plans
async function fetchAllSubscriptionPlans() {
  const { OMNEXIO_BASE_URL, OMNEXIO_API_KEY } = process.env;
  const plansUrl = `${OMNEXIO_BASE_URL}/v1/subscription-plans`;

  const response = await axios.get(plansUrl, {
    headers: {
      Authorization: `Bearer ${OMNEXIO_API_KEY}`,
    },
  });

  return response.data;
}

// Fetch user's current subscription plan ID
async function fetchCurrentSubscriptionPlanId(userId) {
  const { OMNEXIO_BASE_URL, OMNEXIO_API_KEY } = process.env;
  const userPlanUrl = `${OMNEXIO_BASE_URL}/v1/chat-users/${userId}/subscription-plan`;

  try {
    const response = await axios.get(userPlanUrl, {
      headers: {
        Authorization: `Bearer ${OMNEXIO_API_KEY}`,
      },
    });

    return response.data?.id;
  } catch (error) {
    logger.error('[fetchCurrentSubscriptionPlanId] Error:', error);
    return null;
  }
}

module.exports = omnexioSubscriptionPlans;
