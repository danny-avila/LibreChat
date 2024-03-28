const paypal = require('@paypal/checkout-server-sdk');
const addTokensByUserId = require('../../../config/addTokens');

// Setting up PayPal environment
function environment() {
  let clientId = process.env.PAYPAL_CLIENT_ID;
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  return process.env.NODE_ENV === 'production'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

function client() {
  return new paypal.core.PayPalHttpClient(environment());
}

exports.createPayment = async (req, res) => {
  console.log('Received createPayment request with body:', req.body);
  const { userId, amount } = req.body;

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: amount.toString(),
        },
        custom_id: userId.toString(),
      },
    ],
    application_context: {
      return_url: process.env.PAYPAL_RETURN_URL,
      cancel_url: process.env.PAYPAL_CANCEL_URL,
    },
  });

  try {
    const response = await client().execute(request);
    const { purchase_units, links } = response.result;

    console.log('purchase_units:', JSON.stringify(purchase_units, null, 2));
    console.log('links:', JSON.stringify(links, null, 2));
    if (response.statusCode === 201) {
      const approvalUrl = response.result.links.find((link) => link.rel === 'approve').href;
      console.log('Order created successfully: ', response.result.id);
      res.json({ id: response.result.id, approvalUrl: approvalUrl });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating PayPal payment');
  }
};

exports.executePayment = async (req, res) => {
  const { orderId } = req.body; // PayPal order ID returned on payment creation

  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});
  console.log('Sending PayPal order create request with:', request);

  try {
    const capture = await client().execute(request);
    res.status(200).json(capture.result);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error executing PayPal payment');
  }
};

exports.handleWebhook = async (req, res) => {
  console.log('Received webhook with body:', JSON.stringify(req.body));

  const event = req.body;

  console.log(`Webhook event received: ${event.event_type}`, event);

  if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
    const purchaseUnit = event.resource.purchase_units[0];
    const amount = purchaseUnit.amount.value;
    const userId = purchaseUnit.custom_id;

    console.log(`Approved payment of $${amount} for user ${userId}.`);

    try {
      const newBalance = await addTokensByUserId(userId, amount);
      console.log(`Success! ${amount} tokens added, new balance is ${newBalance}.`);
      res.status(200).send('Success! Tokens added.');
    } catch (error) {
      console.error(`Error updating token balance for user ${userId}:`, error);
      res.status(500).send({ error: `Error updating token balance: ${error.message}` });
    }
  } else {
    console.log('Unhandled event type:', event.event_type);
    res.status(200).send('Event received, but not handled.');
  }
};
