const { clerkClient } = require('@clerk/clerk-sdk-node');
const { stripeApiClient } = require('use-stripe-subscription');

const findOrCreateCustomerId = async ({ clerkUserId, clerkOrgId }) => {
  const orgPromise = clerkClient.organizations.getOrganization({ organizationId: clerkOrgId });
  const userPromise = clerkClient.users.getUser(clerkUserId);
  let [org, user] = await Promise.all([orgPromise, userPromise]);

  if (org.publicMetadata.stripeCustomerId) {
    return org.publicMetadata.stripeCustomerId;
  }
  const customerCreate = await stripeApiClient.customers.create(
    {
      name: org.name,
      email: user.emailAddresses.find((x) => x.id === user.primaryEmailAddressId).emailAddress,
      metadata: {
        clerkOrgId: org.id,
      },
    },
    {
      idempotencyKey: org.id,
    },
  );

  org = await clerkClient.organizations.updateOrganization(org.id, {
    publicMetadata: {
      stripeCustomerId: customerCreate.id,
    },
  });
  return org.publicMetadata.stripeCustomerId;
};

module.exports = findOrCreateCustomerId;
