const { Webhook } = require('svix');
const { createNewUser } = require('~/server/controllers/UserController');
const clerkClient = require('@clerk/clerk-sdk-node');

async function userController(req, res) {
  // Check if the 'Signing Secret' from the Clerk Dashboard was correctly provided
  const CLERK_WEBHOOK_KEY = process.env.CLERK_WEBHOOK_KEY;
  if (!CLERK_WEBHOOK_KEY) {
    throw new Error('You need a CLERK_WEBHOOK_KEY in your .env');
  }

  // Grab the headers and body
  const headers = req.headers;
  const payload = JSON.stringify(req.body);

  // Get the Svix headers for verification
  const svix_id = headers['svix-id'];
  const svix_timestamp = headers['svix-timestamp'];
  const svix_signature = headers['svix-signature'];

  // If there are missing Svix headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    });
  }

  // Initiate Svix
  const wh = new Webhook(CLERK_WEBHOOK_KEY);

  let evt;

  // Attempt to verify the incoming webhook
  // If successful, the payload will be available from 'evt'
  // If the verification fails, error out and  return error code
  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    // Console log and return error
    console.log('Webhook failed to verify. Error:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // Grab the ID and TYPE of the Webhook
  const { id } = evt.data;
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const clerkUser = evt.data;
    const userData = {
      clerkUserId: id,
      name: `${
        clerkUser.first_name
          ? clerkUser.first_name + (clerkUser.last_name ? ' ' + clerkUser.last_name : '')
          : ''
      }`,
      email: clerkUser.emailAddresses.find((x) => x.id === clerkUser.primaryEmailAddressId)
        .emailAddress,
      emailVerified:
        clerkUser.emailAddresses.find((x) => x.id === clerkUser.primaryEmailAddressId).verification
          .status === 'verified',
      username: clerkUser.username,
      avtar: clerkUser.image_url,
    };
    const user = await createNewUser(userData);

    await clerkClient.users.updateUser(req.auth.userId, {
      externalId: user.id,
    });

    return res.status(200).json({
      success: true,
      message: 'Webhook received',
    });
  } else {
    return res.status(400).json({
      success: false,
      message: 'Wrong event type',
    });
  }
}

module.exports = userController;
