const { clerkClient } = require('@clerk/clerk-sdk-node');
const { stripeApiClient } = require('use-stripe-subscription');

const findOrCreateCustomerId = async (clerkUserId) => {
  let user = await clerkClient.users.getUser(clerkUserId);
  if (user.publicMetadata.stripeCustomerId) {
    return user.publicMetadata.stripeCustomerId;
  }
  const customerCreate = await stripeApiClient.customers.create(
    {
      name: user.firstName + ' ' + user.lastName,
      email: user.emailAddresses.find((x) => x.id === user.primaryEmailAddressId).emailAddress,
      metadata: {
        clerkUserId: user.id,
      },
    },
    {
      idempotencyKey: user.id,
    },
  );
  user = await clerkClient.users.updateUser(user.id, {
    publicMetadata: {
      stripeCustomerId: customerCreate.id,
    },
  });
  return user.publicMetadata.stripeCustomerId;
};

module.exports = findOrCreateCustomerId;
